"use strict";

/**
 * This module defines the Transaction class as well as classes for specific types of transactions.
 * Only one factory class is exposed via the public interface ([Transaction]{@link module:core/models/Transaction/Transaction}), used
 * to instanciate any type of transaction object.
 * @module core/models/Transaction
 * @link module:core/models/BaseModel
 * @link module:core/models/PaymentAck
 * @link module:core/models/PAymentConfirmation
 */

const config = require('config');
const request = require('request');
const uuidv4 = require('uuid/v4');
const util = require('util');
const moment = require('moment');


const db = require(config.get('system.root_dir') + '/db');
const checks = require(config.get('system.root_dir') + '/core/checks');
const utils = require(config.get('system.root_dir') + '/issuer/utils');
const issuer = require(config.get('system.root_dir') + '/issuer');
const endpoints = require(config.get('system.root_dir') + '/core/api/endpoints');
const errors = require(config.get('system.root_dir') + '/core/models/Errors');
const helpers = require(config.get('system.root_dir') + '/core/helpers');

const { Settings } = require(config.get('system.root_dir') + '/core/models/Settings');
const { Account } = require(config.get('system.root_dir') + '/core/models/Account');
const { PaymentConfirmation } = require(config.get('system.root_dir') + '/core/models/PaymentConfirmation');
const { PaymentAck } = require(config.get('system.root_dir') + '/core/models/PaymentAck');
const { BaseModel } = require(config.get('system.root_dir') + '/core/models/BaseModel');
const { ObjectId } = require('mongodb');

//
// AS SOME STRUCTURES REQUIRES DATA DEFINED LATER ON PART OF STRUCTURES' DEFINITIONS CAN BE FOUND AFTER TRANSACTION
// CLASSES DEFINITIONS
//

/**
 * 'initial' transaction's status. Transaction still can be updated and modified as needed.
 * @type {string}
 * @const
 * @link module:core/models/Transactions~TRANSACTION_STATUSES
 */
const TRANSACTION_STATUS__INITIAL = 'initial';


/**
 * 'resolved' transaction's status. Transaction is completed and not accepting any changes.
 * @type {string}
 * @const
 * @link module:core/models/Transactions~TRANSACTION_STATUSES
 */
const TRANSACTION_STATUS__RESOLVED = 'resolved';


/**
 * 'failed' transaction's status. Transaction failed, it's a terminal state and no more changes is allowed to it.
 * @type {string}
 * @const
 * @link module:core/models/Transactions~TRANSACTION_STATUSES
 */
const TRANSACTION_STATUS__FAILED = 'failed';


/**
 * 'expired' transaction's status. Transaction was not completed in time, it's a terminal state and no more changes is
 * allowed to it.
 * @type {string}
 * @const
 * @link module:core/models/Transactions~TRANSACTION_STATUSES
 */
const TRANSACTION_STATUS__EXPIRED = 'expired';


/**
 * 'aborted' transaction's status. Transaction was by the Buyer before it was resolved, it's a terminal state and no
 * more changes is allowed to it.
 * @type {string}
 * @const
 * @link module:core/models/Transactions~TRANSACTION_STATUSES
 */
const TRANSACTION_STATUS__ABORTED = 'aborted';


/**
 * 'processing' transaction's status. Transaction is being processed right now, changes can't be made in that state.
 * @type {string}
 * @const
 * @link module:core/models/Transactions~TRANSACTION_STATUSES
 */
const TRANSACTION_STATUS__PENDING = 'pending';


/**
 * 'deferred' transaction's status. Transaction is put on hold for a time being and is waiting for a new request to
 * proceed.
 * @type {string}
 * @const
 * @link module:core/models/Transactions~TRANSACTION_STATUSES
 */
const TRANSACTION_STATUS__DEFERRED = 'deferred';


/**
 * Possible transaction statuses, shared among different types of transactions. It is possible that specific types of
 * transactions won't be supporting all statuses. If it's needed to verify the validity of transaction's status it can
 * be done by setting a transaction's [type-specific validator]{@link module:core/models/BaseModel/BaseModel.constructor}.
 * @type {Set}
 */
const TRANSACTION_STATUSES = new Set([
    TRANSACTION_STATUS__INITIAL,
    TRANSACTION_STATUS__PENDING,
    TRANSACTION_STATUS__DEFERRED,
    TRANSACTION_STATUS__RESOLVED,
    TRANSACTION_STATUS__FAILED,
    TRANSACTION_STATUS__ABORTED,
    TRANSACTION_STATUS__EXPIRED,
]);


/**
 * 'payment' type transaction. Used to create and process an order from the Merchant.
 * @type {string}
 * @const
 * @link module:core/models/Transaction/Transaction~TRANSACTION_TYPES
 * @link module:core/models/Transaction/Transaction~TRANSACTION_CLASSES
 * @link module:core/models/Transaction/Transaction
 */
const TRANSACTION_TYPE__PAYMENT = 'payment';


/**
 * 'blockchain-transfer' type transaction. Used to transfer gathered funds to the blockchain.
 * @type {string}
 * @const
 * @link module:core/models/Transaction/Transaction~TRANSACTION_TYPES
 * @link module:core/models/Transaction/Transaction~TRANSACTION_CLASSES
 * @link module:core/models/Transaction/Transaction
 */
const TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER = 'blockchain-transfer';


/**
 * 'coin-file-transfer' type transaction. Used to export gathered fund to the coin file.
 * @type {string}
 * @const
 * @link module:core/models/Transaction/Transaction~TRANSACTION_TYPES
 * @link module:core/models/Transaction/Transaction~TRANSACTION_CLASSES
 * @link module:core/models/Transaction/Transaction
 */
const TRANSACTION_TYPE__COIN_FILE_TRANSFER = 'coin-file-transfer';


/**
 * Possible transaction's types, used by [the transactions factory]{@link module:core/models/Transaction/Transaction}.
 * It's tightly connected to the [TRANSACTION_CLASSES]{@link module:core/models/Transaction/Transaction~TRANSACTION_CLASSES},
 * defined after actual classes definitions.
 * This structure is not directly exposed via the public interface and only available in this module.
 * @type {Set}
 */
const TRANSACTION_TYPES = new Set([
    TRANSACTION_TYPE__PAYMENT,
    TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER,
    TRANSACTION_TYPE__COIN_FILE_TRANSFER,
]);


/**
 * Mapping of possible blockchain transfer speeds to be used in blockchain transfer transactions, mapped to
 * corresponding values on the issuer API side.
 * @type {Map<String>}
 * @const
 * @link module:core/models/Transaction/BlockchainTransferTransaction
 */
const BLOCKCHAIN_TRANSFER_SPEED = new Map([
    [ 'fastest', 'fastest', ],
    [ 'soon', 'soon', ],
    [ 'no-hurry', 'noHurry', ],
    [ 'min-fee', 'minFee', ],
]);


/**
 * Default transfer speed to be used if it's not defined in the transaction
 * @type {string}
 * @const
 * @link module:core/models/Transaction~BLOCKCHAIN_TRANSFER_SPEED
 * @link module:core/models/Transaction/BlockchainTransferTransaction
 */
const BLOCKCHAIN_TRANSFER_SPEED__DEFAULT = 'fastest';


/**
 * Symbol to be used to initialise an empty Transaction objects. Normally, in transaction constructor, fields are
 * assigned its default values - either from the initial data or computed. In situation where we want to simply recreate
 * the object (i.e. after retrieving it from the database) we don't want to invoke this mechanism.
 * Instead of using this constant we could pass a special key in the constructor's init data but this would also allow
 * an empty object to be created externally and we don't want that.
 * Objects in its transition state, without data loaded into its private container, should only exists in this module
 * as we can be sure that, before exposing, they will be finalised and filled with necessary data.
 * By using a symbol we are ensuring that this mechanism won't be invoked from the outside of this module.
 * @type {Symbol}
 * @private
 * @const
 */
const _initialise_empty_object = Symbol('_initialise_empty_object');


/**
 * Symbol to be used to conceal private data container inside the transaction-type objects as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Symbol}
 * @private
 * @const
 */
const _transaction_data = Symbol('_transaction_data');


/**
 * Symbol to be used to conceal private interface container inside the transaction-type objects as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Symbol}
 * @private
 * @const
 */
const _transaction_interface = Symbol('_transaction_interface');


/**
 * Symbol to be used to store database session id inside the transaction-type objects as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Symbol}
 * @private
 * @const
 */
const _db_session = Symbol('_db_session');


/**
 * Set of keys that are available to be set via API as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * Each key holds a set of available keys for a corresponding transaction type.
 * @type {Set}
 * @private
 * @const
 */
const TRANSACTION_API_PROPERTIES = new Map([
    [ TRANSACTION_TYPE__PAYMENT, new Set([ 'currency', 'amount', 'callback_url', 'notification', 'return_url', 'order_id', 'description', 'email_customer_contact', 'polices', 'expires', 'time_budget', 'ack_passthrough', ]), ],
    [ TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER, new Set([ 'currency', 'amount', 'description', 'speed', 'address', 'label', ]), ],
    [ TRANSACTION_TYPE__COIN_FILE_TRANSFER, new Set([ ]), ],
]);


/**
 * Properties available via the object's public interface as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * Each key holds a set of available keys for a corresponding transaction type.
 * @type {Map<Set>}
 * @private
 * @const
 */
const TRANSACTION_ALLOWED_PROPERTIES = new Map([
    [ TRANSACTION_TYPE__PAYMENT, new Set(['type', 'status', 'transaction_id', 'created', 'completed', 'updated',
          'payment_confirmation', 'payment_details', 'payment_ack', 'acceptable_issuers', 'seller', 'payment_url',
          'account_id', 'currency', 'amount', 'callback_url', 'notification', 'return_url', 'order_id', 'description',
          'email_customer_contact', 'polices', 'expires', 'time_budget', 'ack_passthrough', 'total_fee', 'net_value',
    ]),
    ],
    [ TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER, new Set([ 'transaction_id', 'status', 'type', 'currency', 'amount',
            'description', 'speed', 'address', 'label', 'account_id', 'created', 'updated', 'completed',
        ]),
    ],
    [ TRANSACTION_TYPE__COIN_FILE_TRANSFER, new Set([ 'created', 'updated', 'type', ]), ],
]);


/**
 * Properties required by the object before it can be saved in the database as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * Each key holds a set of required keys for a corresponding transaction type.
 * @type {Map<Set>}
 * @private
 * @const
 */
const TRANSACTION_REQUIRED_PROPERTIES = new Map([
    [ TRANSACTION_TYPE__PAYMENT, new Set([ 'type', 'amount', 'currency', 'description', 'acceptable_issuers',
            'transaction_id', 'seller', 'payment_url', 'status', 'account_id',
        ]),
    ],
    [ TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER, new Set([ 'transaction_id', 'type', 'currency', 'amount', 'address', ]), ],
    [ TRANSACTION_TYPE__COIN_FILE_TRANSFER, new Set([]), ],
]);


/**
 * Properties hidden from stringification as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * Each key holds a set of hidden keys for a corresponding transaction type.
 * @type {Map<Set>}
 * @private
 * @const
 */
const TRANSACTION_HIDDEN_PROPERTIES = new Map([
    [ TRANSACTION_TYPE__PAYMENT, new Set([ 'acceptable_issuers', 'seller', 'payment_url', 'account_id', 'updated', ]), ],
    [ TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER, new Set([ 'account_id', ]), ],
    [ TRANSACTION_TYPE__COIN_FILE_TRANSFER, new Set([ 'account_id', ]), ],
]);


/**
 * Read-only properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}.
 * Each key holds a set of read-only keys for a corresponding transaction type.
 * @type {Map<Set>}
 * @private
 * @const
 */
const TRANSACTION_READONLY_PROPERTIES = new Map([
    [ TRANSACTION_TYPE__PAYMENT, new Set([ 'type', 'transaction_id', 'created', 'completed', 'updated', 'acceptable_issuers', 'payment_details', 'payment_ack', 'payment', 'seller', 'payment_url', 'account_id', ]), ],
    [ TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER, new Set([ 'updated', 'created', 'type', 'completed', ]), ],
    [ TRANSACTION_TYPE__COIN_FILE_TRANSFER, new Set([ 'updated', 'created', 'type', 'completed', ]), ],
]);


/**
 * Structure defining validators for Transaction's properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {object}
 * @private
 */
const _transaction_properties_validators = {
    order_id: (order_id) => {
        if (order_id !== undefined && (typeof order_id !== "string" || order_id.length < 1 || order_id.length > 64)) {
            throw new Error ('Invalid format');
        }
        // order_id must be URI safe as it may be used as a part of URL to retrieve the transaction
        if (encodeURIComponent(decodeURIComponent(order_id)) !== order_id) { throw new Error('Invalid format'); }
    },
    expires: (date) => {
        if (!(date instanceof Date)) { throw new Error ('Invalid format'); }
    },
    return_url: Settings.VALIDATORS.return_url,
    callback_url: Settings.VALIDATORS.callback_url,
    amount: (value) => {
        if (!value) { throw new Error ('Required field'); }
        if (!checks.isFloat(value)) { throw new Error('Invalid format'); }
        if (parseFloat(value) > 99999999.99999999 || parseFloat(value) < 0.00000001) { throw new Error('Invalid value'); }
    },
    total_fee: (value) => {
        if (!checks.isFloat(value) || value > 9999999999) { throw new Error('Invalid format'); }
        if (parseFloat(value) <= 0) { throw new Error('Invalid value'); }
    },
    net_value: (value) => {
        if (!checks.isFloat(value) || value > 9999999999) { throw new Error('Invalid format'); }
        if (parseFloat(value) <= 0) { throw new Error('Invalid value'); }
    },
    description: BaseModel.VALIDATORS.description,
    notification: BaseModel.VALIDATORS.notification,
    email_customer_contact: Account.VALIDATORS.email_customer_contact,
    polices: (polices) => {
        if (!polices) { return true; }

        if (typeof polices !== "object") { throw new Error('Invalid format'); }

        let allowed_polices = [ 'receipt_via_email', 'refund_via_email', 'issuer_refund_via_email', ];
        for (let policy of Object.keys(polices)) {
            if (!allowed_polices.includes(policy)) { throw new Error ('Unknown policy'); }
            else if (typeof polices[policy] !== typeof true) { throw new Error ('Invalid format'); }
        }
    },
    currency: Settings.VALIDATORS.default_payment_currency,
    status: status => {
        if (!TRANSACTION_STATUSES.has(status)) { throw new Error('Unknown status'); }
    },
    payment_confirmation: details => true,
    completed: (date) => {
        if (!(date instanceof Date)) { throw new Error ('Invalid format'); }
    },
    speed: (speed) => {
        if (speed !== undefined && !BLOCKCHAIN_TRANSFER_SPEED.has(speed)) { throw new Error ('Invalid value'); }
    },
    address: (address) => {
        if (!address) { throw new Error ('Field required'); }
        if (typeof address !== "string" || address.length < 1 || address.length > 256) { throw new Error ('Invalid format'); }
    },
    label: (label) => {
        if (label !== undefined && (typeof label !== "string" || label.length < 1 || label.length > 64)) {
            throw new Error ('Invalid format');
        }
    },
    time_budget: (seconds) => {
        if (!checks.isInteger(seconds)) { throw new errors.InvalidValueError(); }
        if (seconds < 5 || seconds > 300) { throw new errors.InvalidValueError(); }
    },
    ack_passthrough: PaymentAck.VALIDATORS.ack_passthrough,
};

// We are sealing the structure to prevent any modifications
BaseModel.lockPropertiesOf(_transaction_properties_validators);

/**
 * Structure defining custom getter for Transaction's properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {object}
 * @private
 */
const _transaction_properties_custom_getters = {
    payment_url: function () {
        return `${config.get('server.api.endpoint_url')}${config.get('server.api.endpoint_path')}${endpoints.getEndpointPath(endpoints.getPathForId(endpoints.TRANSACTION_ID_PAYMENT, this.transaction_id))}/`;
    },
    speed: function () {
        return this[_transaction_data].speed ? this[_transaction_data].speed : BLOCKCHAIN_TRANSFER_SPEED__DEFAULT;
    },
    acceptable_issuers: function () {
        if (this[_transaction_data].acceptable_issuers) {
            return this[_transaction_data].acceptable_issuers;
        }
        else {
            return [ '*', ];
        }
    },
};

// We are sealing the structure to prevent any modifications
BaseModel.lockPropertiesOf(_transaction_properties_custom_getters);


/**
 * Structure defining custom setters for Transaction's properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {object}
 * @private
 */
const _transaction_properties_custom_setters = {
    return_url: function (value) {
        // While setting the return url we want it to have transaction_id added to it's query string together with
        // order_id - if present.
        if (value !== undefined) {
            let url = new URL(value);
            url.searchParams.set('transaction_id', this.transaction_id);

            if (this.order_id) {
                url.searchParams.set('order_id', this.order_id);
            }

            value = url.href;
        }

        this[_transaction_data]['return_url'] = value;
    },
    callback_url: function (value) {
        // While setting the callback url we want it to have transaction_id added to it's query string together with
        // order_id - if present.

        if (value !== undefined) {
            let url = new URL(value);
            url.searchParams.set('transaction_id', this.transaction_id);

            if (this.order_id) {
                url.searchParams.set('order_id', this.order_id);
            }

            value = url.href;
        }

        this[_transaction_data]['callback_url'] = value;
    },
    status: function (value) {
        this[_transaction_interface].__prev_status = this[_transaction_data].status;
        this[_transaction_data].status = value;

        if ([ TRANSACTION_STATUS__RESOLVED, TRANSACTION_STATUS__FAILED, ].includes(value)) {
            this[_transaction_data].completed = new Date();
        }
    },
};

// We are sealing the structure to prevent any modifications
BaseModel.lockPropertiesOf(_transaction_properties_custom_setters);


/**
 * Factory class for different types of transactions. This is the only publicly exposed transaction class to provide a
 * common interface to work with transactions.
 * @type {Transaction}
 * @extends BaseModel
 */
class Transaction {
    /**
     * Constructor is instanciating a target transaction class and return its instance instead of original object's.
     * Thanks to that the whole transaction interface is transparent to the end user and allows to create transactions
     * in the same way, no matter the type.
     * @param init_data
     * @param {String} init_data.type - type of transaction to be instanciated as defined in [TRANSACTION_TYPES]{@link module:core/models/Transaction~TRANSACTION_TYPES}
     * structure.
     * @returns {PaymentTransaction | BlockchainTransferTransaction | CoinFileTransferTransaction}
     * @link module:core/models/Transaction~TRANSACTION_TYPES
     * @link module:core/models/Transaction~TRANSACTION_CLASSES
     */
    constructor (init_data={}) {
        if (!init_data.type || !TRANSACTION_TYPES.has(init_data.type)) {
            throw new Error('Invalid type');
        }

        let transaction_class = TRANSACTION_CLASSES.get(init_data.type);

        return new transaction_class(init_data);
    }


    /**
     * Checks if all keys in an object passed as an argument are exposed via API and can be used as a constructor
     * payload. This method should be used on API level in order to test passed in the request keys to check if the
     * request is valid.
     */
    static checkAPIProperties (properties) {
        if (!properties.type) {
            throw new Error('Invalid format');
        }
        let transaction_class = TRANSACTION_CLASSES.get(properties.type);
        let filtered_properties = Object.assign({}, properties);
        delete filtered_properties.type;

        transaction_class.checkAPIProperties(filtered_properties);
    }


    /**
     * A public interface to access class specific validators. This is needed if a different class will have the same
     * property, to reuse its validator, instead of reimplementing it.
     * @returns {Object}
     * @static
     */
    static get VALIDATORS () { return _transaction_properties_validators; }


    /**
     * Set of transaction types.
     * @returns {Set}
     * @static
     */
    static get TYPES () { return TRANSACTION_TYPES; }


    /**
     * Publicly exposed PAYMENT type, described in {@link module:core/models/Transaction~TRANSACTION_TYPE__PAYMENT}
     * @returns {String}
     * @static
     */
    static get TYPE__PAYMENT () { return TRANSACTION_TYPE__PAYMENT; }


    /**
     * Publicly exposed PAYMENT type, described in {@link module:core/models/Transaction~TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER}
     * @returns {String}
     * @static
     */
    static get TYPE__BLOCKCHAIN_TRANSFER () { return TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER; }


    /**
     * Publicly exposed PAYMENT type, described in {@link module:core/models/Transaction~TRANSACTION_TYPE__COIN_FILE_TRANSFER}
     * @returns {String}
     * @static
     */
    static get TYPE__COIN_FILE_TRANSFER () { return TRANSACTION_TYPE__COIN_FILE_TRANSFER; }


    /**
     * Set of transaction statuses.
     * @returns {Set}
     * @static
     */
    static get STATUSES () { return TRANSACTION_STATUSES; }


    /**
     * Publicly exposed INITIAL status, described in {@link module:core/models/Transaction~TRANSACTION_STATUS__INITIAL}
     * @returns {String}
     * @static
     */
    static get STATUS__INITIAL () { return TRANSACTION_STATUS__INITIAL; }


    /**
     * Publicly exposed PENDING status, described in {@link module:core/models/Transaction~TRANSACTION_STATUS__PENDING}
     * @returns {String}
     * @static
     */
    static get STATUS__PENDING () { return TRANSACTION_STATUS__PENDING; }


    /**
     * Publicly exposed DEFERRED status, described in {@link module:core/models/Transaction~TRANSACTION_STATUS__DEFERRED}
     * @returns {String}
     * @static
     */
    static get STATUS__DEFERRED () { return TRANSACTION_STATUS__DEFERRED; }


    /**
     * Publicly exposed RESOLVED status, described in {@link module:core/models/Transaction~TRANSACTION_STATUS__RESOLVED}
     * @returns {String}
     * @static
     */
    static get STATUS__RESOLVED () { return TRANSACTION_STATUS__RESOLVED; }


    /**
     * Publicly exposed FAILED status, described in {@link module:core/models/Transaction~TRANSACTION_STATUS__FAILED}
     * @returns {String}
     * @static
     */
    static get STATUS__FAILED () { return TRANSACTION_STATUS__FAILED; }


    /**
     * Publicly exposed ABORTED status, described in {@link module:core/models/Transaction~TRANSACTION_STATUS__ABORTED}
     * @returns {String}
     * @static
     */
    static get STATUS__ABORTED () { return TRANSACTION_STATUS__ABORTED; }


    /**
     * Publicly exposed EXPIRED status, described in {@link module:core/models/Transaction~STATUS__EXPIRED}
     * @returns {String}
     * @static
     */
    static get STATUS__EXPIRED () { return TRANSACTION_STATUS__EXPIRED; }


    /**
     * Static method that allows to retrieve a set of transactions from the database, identified by the provided
     * parameters. Depending on passed parameters it may return many transactions' objects - or none.
     * It is using object's private interface to initialise the object without firing its validators and
     * setters.
     * @param {String} transaction_id - id of a specific transaction
     * @param {String} account_id - account_id that transactions belongs to. Either account_id or transaction_id has to be provided.
     * @param {String} type - type of transaction as described in [TRANSACTION_TYPES]{@link module:core/models/Transaction~TRANSACTION_TYPES}
     * @param {String} status - status of transaction as described in [TRANSACTION_STATUSES]{@link module:core/models/Transaction~TRANSACTION_STATUSES}
     * @param {Object} custom_query - in case we need to look for non-standards fields we may pass a custom query as described in [db.find]{@link module:db.find}
     * @param {number} offset - index from which we should start looking
     * @param {number} limit - maximum number of records to be returned
     * @param {Date} before - return only records created before this date
     * @param {Date} after - return only records created after this date
     * @param {String} order - direction to order records in - either ascending or descending
     * @param {String} order_by - field to order records by - either created or completed
     * @param {boolean} only_valid - return only records in non-terminal statuses: resolved, initial, pending, deferred
     * @returns {Promise<Transaction[]>}
     * @static
     * @async
     */
    static async find({transaction_id, account_id, type, status, custom_query, offset=0, limit=100, before, after, order="descending", order_by="completed", only_valid=true }) {
        try {
            // Check if all parameters are fine
            if (transaction_id) {
                const uuid_regex = /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

                if (!uuid_regex.exec(transaction_id)) {
                    throw new Error('Missing transaction_id');
                }
            }

            if (account_id && !(account_id instanceof ObjectId)) {
                throw new Error('Missing account_id');
            }

            if (!transaction_id && !account_id) {
                throw new Error('Either transaction_id or account_id has to be provided');
            }

            if (type && !TRANSACTION_TYPES.has(type)) {
                throw new Error('Invalid type');
            }

            if (status && !TRANSACTION_STATUSES.has(status)) {
                throw new Error('Invalid status');
            }

            if (!checks.isInteger(offset)) {
                throw new Error('Invalid offset');
            }

            if (!checks.isInteger(limit)) {
                throw new Error('Invalid limit');
            }

            if (!['ascending', 'descending'].includes(order)) {
                throw new Error('Invalid order');
            }

            if (!['completed', 'created', ].includes(order_by)) {
                throw new Error('Invalid order_by');
            }

            if (before && !checks.isDate(before)) {
                throw new Error('Invalid before date');
            }

            if (after && !checks.isDate(after)) {
                throw new Error('Invalid after date');
            }

            // Initial query
            let query = typeof custom_query === 'object' ? custom_query : {};

            if (account_id) {
                query.account_id = account_id;
            }

            // Find a specific transaction
            if (transaction_id) {
                query.transaction_id = transaction_id;
            }

            // Shows only transactions created before given date
            if (before) {
                query.created = { $lt: new Date(before), };
            }

            // Shows only transactions created after given date
            if (after) {
                query.created = { $gt: new Date(after), };
            }

            // Show only transactions of a given type
            if (type) {
                query.type = { $eq: type, };
            }

            // Shows only transactions in a given status
            if (status) {
                query.status = { $eq: status, };
            }
            // If status is not forced - by default - shows only valid, not expired/aborted transactions. If it's false transactions
            // in all statuses will be returned.
            else if (String(only_valid) === "true") {
                query.status = { $in: [
                        TRANSACTION_STATUS__INITIAL,
                        TRANSACTION_STATUS__RESOLVED,
                        TRANSACTION_STATUS__DEFERRED,
                        TRANSACTION_STATUS__PENDING, ]
                };
            }

            let found_transactions = await db.find('transactions', query, {
                projection: { _id: 0, }, offset: parseInt(offset), limit: parseInt(limit), order: order, order_by: order_by,
            });

            // As prepareInputData may have to read additional information from the database we have to make sure that
            // it's finished before proceeding, hence await all
            return await Promise.all(found_transactions.map(async found_transaction => {

                let transaction = new Transaction({ type: found_transaction.type, [_initialise_empty_object]: true, });

                transaction[_transaction_data] = await transaction.prepareInputData(found_transaction);

                return transaction;
            }));
        }
        catch (e) {
            console.log('getTransactions', e);
            throw e;
        }
    }
}

exports.Transaction = Transaction;


/**
 * This is an interface class for all transaction-like classes. It defines common methods and calls BaseModel
 * constructor using shared structures. It should not be instanciated on its own.
 * @type {CoreTransaction}
 * @extends BaseModel
 * @abstract
 */
class CoreTransaction extends BaseModel {
    /**
     * Constructor accepts class-specific structures and together with the shared ones initialises BaseModel mechanisms
     * by calling the super constructor. Required structures are described in {@link module:core/models/BaseModel/BaseModel.constructor}
     * @param {Set} allowed_properties
     * @param {Set} api_properties
     * @param {Set} required_properties
     * @param {Set} hidden_properties
     * @param {Set} readonly_properties
     */
    constructor({ allowed_properties, api_properties, required_properties, hidden_properties, readonly_properties, }) {
        super({
            private_data_container_key: _transaction_data,
            private_interface_key: _transaction_interface,
            db_session_id: _db_session,
            custom_getters: _transaction_properties_custom_getters,
            custom_setters: _transaction_properties_custom_setters,
            validators: _transaction_properties_validators,
            allowed_properties: allowed_properties,
            required_properties: required_properties,
            hidden_properties: hidden_properties,
            readonly_properties: readonly_properties,
            api_properties: api_properties,
            db_table: 'transactions',
            db_id_field: 'transaction_id',
        });

        this[_transaction_interface].__initialised = moment();
    }


    /**
     * Overrides {@link module:core/models/BaseModel/BaseModel.save} enforcing checking 'status' before saving the
     * object.
     * In order to persist Transaction we have to make sure that it's still in the same status as in the moment we
     * started processing it, to make sure that there are no concurrent requests working on it.
     * @param {Boolean} optimistic_locking_enabled - persist Transaction while checking if it wasn't mutated by the concurrent request
     * @returns {Promise<Transaction>}
     */
    async save ({ optimistic_locking_enabled=true, overwrite_non_final_state_only=false, }={}) {
        let query, status_value = [];

        if (overwrite_non_final_state_only) {
            status_value.push({
                status: { $in: [ TRANSACTION_STATUS__INITIAL, TRANSACTION_STATUS__PENDING, TRANSACTION_STATUS__DEFERRED, ], }
            });
        }

        if (optimistic_locking_enabled) {
            status_value.push({
                status: this[_transaction_interface].__prev_status || this[_transaction_data].status,
            });
        }

        query = status_value.length === 1 ? status_value[0] : { $and: status_value, };
        await super.save({ query: query, });

        this[_transaction_interface].__prev_status = this.status;
    }
}


/**
 * Transaction type-specific class. It implements mechanisms to fully proceed via the payment process as described in
 * the Bitcoin-Express Payment specification.
 * @type {PaymentTransaction}
 * @extends CoreTransaction
 */
class PaymentTransaction extends CoreTransaction {
    /**
     * Main job is being done be the super constructor in [CoreTransaction]{@link module:core/models/Transaction/CoreTransaction}
     * but we need to pass structures required by the BaseModel that are class-specific.
     * @param init_data
     */
    constructor(init_data={}) {
        super({
            allowed_properties: TRANSACTION_ALLOWED_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT),
            api_properties: TRANSACTION_API_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT),
            required_properties: TRANSACTION_REQUIRED_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT),
            hidden_properties: TRANSACTION_HIDDEN_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT),
            readonly_properties: TRANSACTION_READONLY_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT),
        });

        // As type is set explicitly leaving it in the init_data would break a loop below as it uses public interface to
        // initialise object's properties and type is a read-only property. We could enforce removing it from the inout
        // data but this would require to make such an operation in a couple of different places so it's easier to do it
        // here.
        delete init_data.type;

        this[_transaction_data].type = TRANSACTION_TYPE__PAYMENT;

        // If we didn't ask to initialise an empty object as described in _initialise_empty_object - set the default
        // values
        if (!init_data[_initialise_empty_object]) {
            this[_transaction_data].transaction_id = uuidv4();
            this[_transaction_data].order_id = init_data.order_id || undefined;
            this[_transaction_data].status = TRANSACTION_STATUS__INITIAL;
            this[_transaction_data].account_id = init_data.account.account_id;
            this[_transaction_data].acceptable_issuers = [ `(${init_data.account.settings.home_issuer})`, ];
            this[_transaction_data].seller = init_data.account.domain;
            this[_transaction_data].created = new Date();

            this.return_url = init_data.return_url || init_data.account.settings.return_url || undefined;
            this.callback_url = init_data.callback_url || init_data.account.settings.callback_url || undefined;

            this.expires = init_data.expires ?
                           (
                               init_data.expires instanceof Date ?
                               init_data.expires :
                               new Date(init_data.expires)
                           ) :
                           new Date(this.created.getTime() + init_data.account.settings.default_payment_timeout * 1000);

            this.email_customer_contact = init_data.email_customer_contact || init_data.account.email_customer_contact;

            this.polices = {
                receipt_via_email: init_data.polices && init_data.polices.hasOwnProperty('receipt_via_email') ?
                                   init_data.polices.receipt_via_email :
                                   init_data.account.settings.provide_receipt_via_email,
                refund_via_email: init_data.polices && init_data.polices.hasOwnProperty('refund_via_email') ?
                                  init_data.polices.refund_via_email :
                                  init_data.account.settings.provide_refund_via_email,
                issuer_refund_via_email: init_data.polices && init_data.polices.hasOwnProperty('issuer_refund_via_email') ?
                                  init_data.polices.issuer_refund_via_email :
                                  init_data.account.settings.provide_issuer_refund_via_email,
            };

            this.currency = init_data.currency || init_data.account.settings.default_payment_currency;
            this.time_budget = init_data.time_budget || config.get('server.api.time_budget');
            this.notification = init_data.notification;

            if (!this.return_url && !this.notification) {
                throw new Error('Either return_url or notification is required');
            }
        }

        // We are initialising values passed in the init_data. We do it via the public interface hence we are enforcing
        // validity of the data.
        for (let property of TRANSACTION_ALLOWED_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT)) {
            if (init_data[property] && this[_transaction_data][property] === undefined) {
                this[property] = init_data[property];
            }
        }
    }


    /**
     * Properties' names that can be set via API. This structure is used by the static method [checkAPIProperties]{@link module:core/models/BaseModel/BaseModel#checkAPIProperties}
     * to validate if passed structure has only allowed properties and can be feed to constructor.
     * @returns {Set<Sring>>}
     * @static
     */
    static get API_PROPERTIES () { return TRANSACTION_API_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT); }


    /**
     * Return a map mapping properties that should be used in a JSON representation of 'payment_details' key to internal
     * object's properties.
     * @returns {Map}
     * @static
     */
    static get PAYMENT_DETAILS_PROPERTIES () {
        return new Map([
            [ 'amount', 'amount', ],
            [ 'currency', 'currency', ],
            [ 'description', 'description', ],
            [ 'expires', 'expires', ],
            [ 'created', 'created', ],
            [ 'seller', 'seller', ],
            [ 'payment_url', 'payment_url', ],
            [ 'polices', 'polices', ],
            [ 'email_customer_contact', 'email_customer_contact', ],
            [ 'transaction_id', 'transaction_id', ],
            [ 'order_id', 'order_id', ],
            [ 'acceptable_issuers', 'acceptable_issuers', ],
        ]);
    }


    /**
     * Method parsing and preparing data to be stored in the object's private data container. Its main purpose is to be
     * run after transaction is retrieved from the database to make sure that all sub-documents are restored to the
     * original form and have the right prototype assigned and not left as Objects
     * @param input_data
     * @returns {Promise<Object>}
     */
    async prepareInputData(input_data) {
        if (input_data.payment_confirmation && !(input_data.payment_confirmation instanceof PaymentConfirmation)) {
            input_data.payment_confirmation = new PaymentConfirmation(input_data.payment_confirmation);
        }

        if (input_data.payment_ack && !(input_data.payment_ack instanceof PaymentAck)) {
            input_data.payment_ack = new PaymentAck(input_data.payment_ack);
        }

        return input_data;
    }


    /**
     * Extends the [BaseModel create]{@link module:core/models/BaseModel/BaseModel.create} by adding class specific
     * operations to be performed before object can be saved to the database.
     * It has two custom behaviours:
     * - if an order_id is provided, as it has to be account-uniqe, we need to check if there is already a transaction
     * with the same order_id. If there is one we need to act accordingly:
     *      - if transaction is in initial state - we are not creating a new transaction but instead updating the old
     *      one, but leaving transaction_id intact,
     *      - if transaction is processing or resolved - we are throwing an error as only one non-terminal order_id
     *      should be present at all times,
     *      - if transaction is expired or aborted - we are creating a new transaction.
     * - after transaction is created we are setting a timer to expire it after given time. Expired transaction may be
     * deleted after time if the Gateway operator wishes so.
     * @returns {Promise<PaymentTransaction>}
     * @async
     * @link module:core/models/BaseModel/BaseModel.create
     */
    async create () {
        let existing_transaction = undefined;

        // If there is an order_id we need to check if we should update the old transaction, throw or create a new one
        if (this.order_id) {
            try {
                existing_transaction = await Transaction.find({
                    account_id: this.account_id,
                    custom_query: { order_id: this.order_id, },
                });
                if (existing_transaction.length > 0) {
                    existing_transaction = existing_transaction[0];
                }
                else {
                    existing_transaction = undefined;
                }
            }
            catch (e) {
                console.log ('Transaction payment order id', e);
                throw new errors.FatalError({ message: 'Unable to retrieve existing transaction', });
            }
        }

        let db_session = db.getClient().startSession();
        await db_session.startTransaction();
        this.initDBSession(db_session);

        // Assuming we've found a transaction and it's not in a terminal state...
        if (existing_transaction &&
            existing_transaction.status !== Transaction.STATUS__FAILED &&
            existing_transaction.status !== Transaction.STATUS__ABORTED &&
            existing_transaction.status !== Transaction.STATUS__EXPIRED
        ) {
            //...if it's still pending we need to throw...
            if (existing_transaction.status === Transaction.STATUS__PENDING) {
                this.closeDBSession();
                await db_session.endSession();
                throw new errors.InvalidValueError({ message: `Transaction with order_id ${this.order_id} is currently being processed.`});
            }
            //...if it's deferred we need to throw...
            else if (existing_transaction.status === Transaction.STATUS__DEFERRED) {
                this.closeDBSession();
                await db_session.endSession();
                throw new errors.InvalidValueError({ message: `Transaction with order_id ${this.order_id} is deferred and can't be modified. Abort it in order to modify.`});
            }
            //...if it's already resolved we need to throw...
            else if (existing_transaction.status === Transaction.STATUS__RESOLVED) {
                this.closeDBSession();
                await db_session.endSession();
                throw new errors.InvalidValueError({ message: `Transaction with order_id ${this.order_id} is already resolved.`});
            }
            //...if it's still in the initial status we have to abort it first...
            else if (existing_transaction.status === Transaction.STATUS__INITIAL) {
                try {
                    existing_transaction.status = Transaction.STATUS__ABORTED;
                    await existing_transaction.save();

                }
                catch (e) {
                    await db_session.abortTransaction();
                    this.closeDBSession();
                    await db_session.endSession();
                    throw e;
                }
            }
        }
        //... and now we can create a new one
        try {
            await super.create();
            await db_session.commitTransaction();
        }
        catch (e) {
            await db_session.abortTransaction();
            this.closeDBSession();
            await db_session.endSession();
            throw e;
        }

        try {
            let timeout = this.expires - new Date();

            // We want to automatically expire the transaction after a set time hence we need to schedule an expiry
            // action

            setTimeout(() => {
                let query = {
                    transaction_id: { $eq: this.transaction_id, },
                    status: { $eq: Transaction.STATUS__INITIAL, },
                };

                console.log("Transaction expired - " + this.transaction_id);
                try {
                    db.findAndModify('transactions', query, {
                        status: Transaction.STATUS__EXPIRED,
                        updated: new Date(),
                    });
                }
                catch (e) {
                    console.log('Error during Transaction migration from initial to expired', e);
                }
            }, timeout);
        }
        catch (e) {
            console.log('Error during setting timeout for Transaction migration from initial to expired', e);
        }

        return this;
    }


    /**
     * Implements the [BaseModel resolve]{@link module:core/models/BaseModel/BaseModel.resolve}. It's main purpose is to
     * complete a transaction by accepting a payment confirmation from the Buyer and returning PaymentAck as defined in
     * Bitcoin-Express Payment specification.
     * @param {PaymentConfirmation} payment_confirmation
     * @returns {Promise<PaymentAck>}
     * @async
     * @link module:core/models/PaymentConfirmation
     * @link module:core/models/PaymentAck
     */
    async resolve (payment_confirmation) {
        this.checkRequiredProperties();

        // We are building an initial PaymentAck object as we will always return it
        let payment_ack = new PaymentAck({
            status: PaymentAck.STATUS__REJECTED,
            wallet_id: payment_confirmation.wallet_id,
        });


        // Perform status-wise checks...

        //...check if Transaction was already aborted or is pending right now...
        if (this.status === Transaction.STATUS__ABORTED || this.status === Transaction.STATUS__PENDING) {
            //...and if so - reject the request.
            return payment_ack;
        }

        //...or if it is in a terminal state...
        if (this.status === Transaction.STATUS__RESOLVED && this.status === Transaction.STATUS__FAILED) {
            try {
                //..check if request is made with the same Coins...
                if (this.payment_confirmation.coins.sort().toString() !== payment_confirmation.coins.sort().toString()) {
                    //...and if it is not or Coins are not available at all - go to catch block...
                    throw new Error();
                }
                else {
                    //...if it is - return the original payment_ack.
                    return this.payment_ack;
                }
            }
            catch (e) {
                console.log('transaction resolved error', e);

                //...and reject the request.
                payment_ack.status = PaymentAck.STATUS__REJECTED;
                return payment_ack;
            }
        }

        //...or if it has expired...
        if (this.status === Transaction.STATUS__EXPIRED) {
            payment_ack.status = PaymentAck.STATUS__REJECTED;

            return payment_ack;
        }

        //...after this point only initial or deferred Transactions are allowed so quit if somehow Transaction has a
        // different status.
        if (this.status !== Transaction.STATUS__INITIAL && this.status !== Transaction.STATUS__DEFERRED) {
            return payment_ack;
        }


        // Perform prima facie checks. Check...

        //...if all Coins have the right currency...
        if (!payment_confirmation.coins.every(coin => this.currency === utils.Coin(coin).c)) {
            payment_ack.status = PaymentAck.STATUS__FAILED;
            return payment_ack;
        }

        //...if total value is enough to cover the Transaction...
        if (utils.coinsValue(payment_confirmation.coins) < this.amount) {
            payment_ack.status = PaymentAck.STATUS__FAILED;
            return payment_ack;
        }

        let account = undefined;
        try {
            account = await Account.find(this.account_id);

            console.log('account', account.account_id);

            // Up to this point we didn't fail the transaction if something was wrong with it or with the request, but
            // if we can tell that the account that the transaction was created for is missing it's not something we
            // can recover from in the next iteration and we should fail the transaction.
            if (!account) {
                payment_ack.status = PaymentAck.STATUS__FAILED;

                try {
                    // Let's try to save information that transaction has failed, together with payment_ack and
                    // payment_confirmation
                    this.status = Transaction.STATUS__FAILED;
                    this[_transaction_data].payment_ack = payment_ack;
                    this[_transaction_data].payment_confirmation = payment_confirmation;

                    await this.save();
                }
                catch (e) {
                    //If we failed there is nothing we can do - we still need to return information to the Buyer
                }

                return payment_ack;
            }

            payment_ack.seller = account.domain;
        }
        catch (e) {
            // Something went wrong during retrieving the account but it shouldn't be fatal for the transaction so let's
            // give it another chance
            payment_ack.status = PaymentAck.STATUS__DEFERRED;
            payment_ack.retry_after = config.get('server.api.soft_error_retry_delay');

            return payment_ack;
        }

        //...prima facie checks passed - start processing the transaction.

        // As we are going to persist Transaction many times and require common process to do it (plus access to context
        // variables) we are defining a function expression to do it. This function expression will
        // try to persist Transaction and in case of an error - handle it:
        // - if error is due to the fact that Transaction was already migrated by a different process (Persistence
        // Error) tries to return already saved PaymentAck,
        // - if there is no payment_ack to recover - return failed PaymentAck,
        // - and if error is of a different kind - return soft-error to try again a little bit later.

        const _persistTransaction = async () => {
            try {
                // Try to persist the Transaction...
                await this.save();
            }
            catch (e) {
                console.log('Persist Transaction error', e);
                payment_ack.status = PaymentAck.STATUS__FAILED;

                //...and if it is not possible, check if it is due to the fact that...
                try {
                    // ...this Transaction was already migrated by another process...
                    if (e instanceof errors.PersistenceError) {
                        let original_transaction = Transaction.find({ transaction_id: this.transaction_id, type: Transaction.TYPE__PAYMENT, limit: 1, only_valid: false, });

                        //...and if so check if there is payment_ack that we can use...
                        if (original_transaction && original_transaction.payment_ack && Object.keys(original_transaction.payment_ack).length > 0) {
                            return original_transaction.payment_ack;
                        }
                        //...if not - return failed PaymentAck
                        else {
                            return payment_ack;
                        }
                    }
                    //...or if there was different type of error - return soft error so this Transaction can be retried...
                    else {
                        payment_ack.status = PaymentAck.STATUS__DEFERRED;
                        payment_ack.retry_after = config.get('server.api.soft_error_retry_delay');

                        return payment_ack;
                    }
                }
                //...if something breaks - return failed PaymentAck.
                catch (e) {
                    return payment_ack;
                }
            }
        };


        // Mark current transaction as pending to prevent next requests to modify it in any way...
        this.status = Transaction.STATUS__PENDING;

        let error_payment_ack = await _persistTransaction();
        if (error_payment_ack) { return error_payment_ack; }


        console.log('transaction migrated to pending state');

        // We want to automatically defer the Transaction after depleting time_budget extended by a time buffer to
        // prevent pending Transactions from hanging and make them available for the Wallet again
        let pending_to_deferred_timeout = undefined;
        try {
            let timeout = (this.time_budget + config.get('server.api.time_budget_trigger_buffer')) * 1000;

            pending_to_deferred_timeout = setTimeout(() => {
                let query = {
                    transaction_id: { $eq: this.transaction_id, },
                    status: { $eq: Transaction.STATUS__PENDING, },
                };

                console.log("Pending Transaction deferred - " + this.transaction_id);

                try {
                    db.findAndModify('transactions', query, {
                        status: Transaction.STATUS__DEFERRED,
                        updated: new Date(),
                    });
                }
                catch (e) {
                    console.log('Error during Transaction migration from pending to deferred', e);
                }
            }, timeout);
        }
        catch (e) {
            console.log('Error during setting timeout for Transaction migration from pending to deferred', e);
        }

        // As we are calling issuer multiple times we need a common way to handle these calls. This is why we need this
        // function expression. It's task is to call the Issuer using given parameters and handle the response.
        // This function expression takes two parameters:
        // - issuer_call_args - an array of arguments that will be passed to the Issuer call,
        // - ok_handler - a function to handle positive result from the Issuer. Negative/Error responses and cases are
        // handled in the same way, but each type of Issuer's request requires different type of operation to be
        // performed.
        //
        // ok_handler should return PaymentAck in case of an error or nothing if operation succeeded.
        const _handleIssuerCall = async (issuer_call_args, ok_handler) => {
            try {
                let iterator = 1,
                    issuer_response = undefined,
                    negative_response_indicator = true;

                // If we can and if it's reasonable we will try to retry this operation if we are still within
                // time_budget limit and number of possible retries is not crossed
                while (iterator++ <= config.get('server.api.issuer_call_retries')) {
                    try {
                        issuer_response = await issuer.post(...issuer_call_args);
                        console.log('issuer_response', issuer_response, 'retry: ', iterator - 1);
                    }
                    catch (e) {
                        // We are handling the result in ifs below so we don't need any specific behaviour in here
                        console.log('issuer_response error', issuer_response, 'retry: ', iterator - 1);
                    }

                    // If there the response is malformed or deferred handle it accordingly...
                    if (!issuer_response ||
                        !issuer_response.issuerResponse ||
                        !issuer_response.issuerResponse.status ||
                        !issuer_response.issuerResponse.headerInfo ||
                        issuer_response.issuerResponse.status === "defer") {
                        //...check if we are already post time_budget limit for this operation...
                        if (moment().isAfter(moment(this[_transaction_interface].__initialised).add(this.time_budget, 'seconds'))) {
                            payment_ack.status = PaymentAck.STATUS__DEFERRED;

                            this[_transaction_data].payment_ack = payment_ack;
                            this.status = Transaction.STATUS__DEFERRED;

                            break;
                        }
                        //...check if there is after set in the Issuer's response and if so if it's crossing time_budget
                        // limit...
                        else if (issuer_response.issuerResponse && issuer_response.issuerResponse.after &&
                            moment().add(issuer_response.issuerResponse.after, 'seconds').isAfter(moment(this[_transaction_interface].__initialised).add(this.time_budget, 'seconds'))) {

                            payment_ack.status = PaymentAck.STATUS__DEFERRED;
                            payment_ack.retry_after = issuer_response.issuerResponse.after;

                            this[_transaction_data].payment_ack = payment_ack;
                            this.status = Transaction.STATUS__DEFERRED;

                            break;
                        }
                        //...check if there is after set in the Issuer's response and if so wait for such a time before
                        // making another request...
                        else if (issuer_response.issuerResponse && issuer_response.issuerResponse.after) {
                            await helpers.sleep(issuer_response.issuerResponse.after * 1000);
                        }
                        //...in other case - retry as long as number of retries is not exhausted.
                        else {
                            continue;
                        }
                    }
                    //...if the response is positive run "ok_handler" on it...
                    else if (issuer_response && issuer_response.issuerResponse && issuer_response.issuerResponse.status === 'ok') {
                        let ok_response = await ok_handler(issuer_response);

                        //...if ok_handler did not return anything it means that there was no error and we can exit the
                        // loop. It'a also the way of informing code calling _handleIssuerCall that there was no error
                        // caught during the process.
                        if (!ok_response) {
                            negative_response_indicator = false;
                        }

                        break;
                    }
                    //...any other kind of answer indicates that something went wrong but we can't be sure what and it
                    // may be worth to retry the operation.
                    else {
                        payment_ack.status = PaymentAck.STATUS__DEFERRED;
                        payment_ack.retry_after = issuer_response.issuerResponse && issuer_response.issuerResponse.after ?
                                                  issuer_response.issuerResponse.after :
                                                  config.get('server.api.soft_error_retry_delay');

                        this[_transaction_data].payment_ack = payment_ack;
                        this.status = Transaction.STATUS__DEFERRED;
                        break;
                    }
                }
                // Try to persist the operation's result, no matter positive or negative...
                let error_payment_ack = await _persistTransaction();
                //...if it's not possible - return persistence's PaymentAck...
                if (error_payment_ack) { return error_payment_ack; }
                //...if successful but the Issuer call has negative outcome - return it.
                if (negative_response_indicator) {
                    // We know at this point that Transaction is no longer in pending state so we should remove
                    // migration timeout.
                    clearTimeout(pending_to_deferred_timeout);
                    return payment_ack;
                }
            }
            catch (e) {
                payment_ack.status = PaymentAck.STATUS__DEFERRED;
                payment_ack.retry_after = config.get('server.api.soft_error_retry_delay');

                this[_transaction_data].payment_ack = payment_ack;
                this.status = Transaction.STATUS__DEFERRED;

                let error_payment_ack = await _persistTransaction();
                if (error_payment_ack) { return error_payment_ack; }

                // We know at this point that Transaction is no longer in pending state so we should remove
                // migration timeout.
                clearTimeout(pending_to_deferred_timeout);

                return payment_ack;
            }
        };

        console.log('before begin');

        // If we do not already have verify_tid we need to call /begin to get one...
        if (!this.payment_confirmation || !this.payment_confirmation.verify_tid) {
            let issuer_call_result = await _handleIssuerCall(
                [ 'begin', { issuerRequest: { fn: "verify", } }, account.settings.home_issuer, ],
                async (issuer_response) => {

                    if (!issuer_response.issuerResponse.headerInfo || !issuer_response.issuerResponse.headerInfo.tid) {
                        payment_ack.status = PaymentAck.STATUS__DEFERRED;
                        payment_ack.retry_after = config.get('server.api.soft_error_retry_delay');

                        this[_transaction_data].payment_ack = payment_ack;
                        this.status = Transaction.STATUS__DEFERRED;

                        return payment_ack;
                    }

                    payment_confirmation.verify_tid = issuer_response.issuerResponse.headerInfo.tid;
                    payment_confirmation.verify_expiry = moment().add(config.get('system.issuer_verify_call_expiry'), 'seconds').toDate();

                    this[_transaction_data].payment_confirmation = payment_confirmation;

                    // TODO: calculate if there is change coin needed

                }
            );

            if (issuer_call_result) { return issuer_call_result; }
        }
        //...and if we have verify_tid we need to check if it's still valid.
        else if (moment(this.payment_confirmation.verify_expiry).isBefore(moment())) {
            this.status = Transaction.STATUS__FAILED;

            let error_payment_ack = await _persistTransaction();
            if (error_payment_ack) { return error_payment_ack; }

            clearTimeout(pending_to_deferred_timeout);
        }


        // As we are going to both persist the Transaction and Coins we have to perform these operations inside a
        // database transaction so we can revert everything in case of an error. We have to use "all or nothing"
        // approach.
        let db_session = db.getClient().startSession();
        await db_session.startTransaction();
        this.initDBSession(db_session);

        // TODO: make a class
        let coin_data = {};


        console.log('before verify');
/*
        const _handleIssuerCall2 = async (issuer_call_args, ok_handler) => {
            return await ok_handler({
                issuerResponse: {
                    verifyInfo: {
                        actualValue: "0.00005",
                        changeValue: "0.00000000",
                        currency: "XBT",
                        exchangedValue: "0.00000000",
                        faceValue: "0.00005",
                        fees: [
                            {
                                domain: "eu.carrotpay.com",
                                totalFee: "0.00000454",
                                valueFee: "0.00000454"
                            }
                        ],
                        issuePolicy: "single",
                        reference: "67972259-4d91-4a88-b0b0-f525a4c2ce29",
                        targetValue: "0.00005",
                        totalFee: "0.00000454",
                        verifiedValue: "0.00088446"
                    },
                    coin: "ewogICJhIjoiV1d4QVE3TzFtaHNNcUJpU0lPOWtKQmFIV1NrV2plN0oiLAogICJjIjoiWEJUIiwKICAiZCI6IjE5Mi4xNjguMC43OjgwODAiLAogICJlIjoiMjAyMC0xMS0xOFQyMDoyMzowNC4wOFoiLAogICJpIjoiMzM0NzI1NjIyNTM5MzM5ODEyNyIsCiAgInYiOiIwLjAwMDkxNjgxIiwKICAieCI6IjAiCn0="
                }
            });
        };
*/

        try {
            let issuer_call_result = await _handleIssuerCall(
                [ 'verify', {
                        issuerRequest: {
                            tid: this.payment_confirmation.verify_tid,
                            expiry: this.payment_confirmation.verify_expiry,
                            coin: this.payment_confirmation.coins,
                            issuePolicy: "single",
                            expiryEmail: {
                                email: config.get('server.api.issuer_recovery_email'),
                                passphrase: config.get('server.api.issuer_recovery_password'),
                            },
                            // targetValue: this.amount,
                        },
                    },
                    account.settings.home_issuer,
                ],
                async (issuer_response) => {
                    let verify_info = issuer_response.issuerResponse.verifyInfo;

                    if (!issuer_response.issuerResponse.coin && !issuer_response.issuerResponse.verifyInfo) {
                        payment_ack.status = PaymentAck.STATUS__FAILED;

                        // TODO: fix this condition, it seems wrong because of the if above
                        if (issuer_response.issuerResponse.coin) {
                            payment_ack.coins = [ issuer_response.issuerResponse.coin, ];
                        }

                        this[_transaction_data].payment_ack = payment_ack;
                        this.status = Transaction.STATUS__FAILED;

                        return payment_ack;
                    }

                    if (verify_info.actualValue < this.amount) {
                        payment_ack.status = PaymentAck.STATUS__FAILED;
                        payment_ack.coins = [ issuer_response.issuerResponse.coin, ];

                        this[_transaction_data].payment_ack = payment_ack;
                        this.status = Transaction.STATUS__FAILED;

                        return payment_ack;
                    }

                    coin_data = {
                        account_id: this.account_id,
                        coins: issuer_response.issuerResponse.coin,
                        currency: this.currency,
                        date: new Date(),
                        value: verify_info.actualValue,
                        transaction_id: this.transaction_id,
                    };

                    if (payment_confirmation.notification) {
                        coin_data.notification = payment_confirmation.notification;
                    }

                    if (payment_confirmation.client) {
                        coin_data.client = payment_confirmation.client;
                    }

                    if (this.order_id) {
                        coin_data.order_id = this.order_id;
                    }

                    this.net_value = verify_info.verifiedValue;
                    this.total_fee = verify_info.totalFee;

                    // TODO: add coins encryption before saving them in the database

                    await db.insert('coins', coin_data);

                    if (this.return_url) {
                        payment_ack.return_url = this.return_url;
                    }

                    if (this.notification) {
                        payment_ack.notification = this.notification;
                    }

                    if (this.ack_passthrough) {
                        payment_ack.ack_passthrough = this.ack_passthrough;
                    }

                    payment_ack.reference = {
                        id: verify_info.reference,
                        issuer: helpers.extractIssuer(this.acceptable_issuers[0]),
                    };
                    payment_ack.status = PaymentAck.STATUS__OK;
                    if (this.return_url) {
                        payment_ack.return_url = this.return_url;
                    }

                    if (this.notification) {
                        payment_ack.notification = this.notification;
                    }

                    this.status = Transaction.STATUS__RESOLVED;
                    this[_transaction_data].payment_ack = payment_ack;
                    this[_transaction_data].payment_confirmation.verify_info = verify_info;
                }
            );
            await db_session.commitTransaction();

            if (issuer_call_result) { return issuer_call_result; }

            console.log('post verify, all good');

            let error_payment_ack = await _persistTransaction();

            if (error_payment_ack) { return error_payment_ack; }
            clearTimeout(pending_to_deferred_timeout);
            if (issuer_call_result) {
            //     TODO: send recovered Coins back to the Buyer
                return issuer_call_result;
            }
            console.log('saved, calling end')

            // Try to finish transaction on the Issuers end...
            try {
                issuer.post('end', {
                    issuerRequest: {
                        tid: this.payment_confirmation.issuer_tid,
                    }
                }, account.settings.home_issuer).
                catch(e => console.log("Couldn't close transaction on the Issuer's end", e));
            }
            //... but we don't really care if we couldn't
            catch (e) {
                console.log("Couldn't close transaction on the Issuer's end", e);
            }

            // Call callback_url if there is one, but again - we are not aborting the transaction if this fails
            try {
                if (this.callback_url) {
                    request(this.callback_url, (error, response, body, ) => {
                        if (error) {
                            console.log(`Transaction Payment - Payment resolve - callback url: ${this.callback_url} error:`, error);
                        }
                        else if (response && response.statusCode !== 200) {
                            console.log(`Transaction Payment - Payment resolve - callback url: ${this.callback_url} status warning: ${response.statusCode}`);
                        }
                        else {
                            console.log(`Transaction Payment - Payment resolve - callback url: ${this.callback_url} status: success`);
                        }
                    });
                }
            }
            catch (e) {
                console.log(`Transaction Payment - Payment resolve - callback url: ${this.callback_url} catch error:`, e);
            }

            return payment_ack;
        }
        catch (e) {
            console.log("Failed during finalising payment: " + e.toString());

            try {
                if (this.status === Transaction.STATUS__FAILED) {
                    issuer.post('end', {
                        issuerRequest: {
                            tid: this.payment_confirmation.tid
                        }
                    }, coins_domain);
                }
            }
            catch (e) {
                console.log("Failed during sending 'end' to an issuer: " + e.toString());
            }

            await db_session.abortTransaction();

            throw e;
        }
        finally {
            this.closeDBSession();
            await db_session.endSession();
        }
    }

    toJSON() {
        // Let's populate all fields on the root level...
        let data = super.toJSON();


        //...as Payment specification demands 'payment_details' section - let's create one...
        data.payment_details = {};
        for (let property of PaymentTransaction.PAYMENT_DETAILS_PROPERTIES.entries()) {
            if (this[property[1]] !== undefined) {
                data.payment_details[property[0]] = this[property[1]];
            }
        }

        //...Payment specification also requires 'payment' section instead of 'payment_confirmation' so we have to rename it...
        if (data.hasOwnProperty('payment_confirmation')) {
            data.payment = data.payment_confirmation;
            delete data.payment_confirmation;
        }

        return data;
    }
}


/**
 * Transaction type-specific class. It implements mechanisms to transfer gathered funds into the blockchain.
 * @type {BlockchainTransferTransaction}
 * @extends CoreTransaction
 */
class BlockchainTransferTransaction extends CoreTransaction {
    /**
     * Main job is being done be the super constructor in [CoreTransaction]{@link module:core/models/Transaction/CoreTransaction}
     * but we need to pass structures required by the BaseModel that are class-specific.
     * @param init_data
     */
    constructor(init_data={}) {
        super({
            allowed_properties: TRANSACTION_ALLOWED_PROPERTIES.get(TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER),
            api_properties: TRANSACTION_API_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT),
            required_properties: TRANSACTION_REQUIRED_PROPERTIES.get(TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER),
            hidden_properties: TRANSACTION_HIDDEN_PROPERTIES.get(TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER),
            readonly_properties: TRANSACTION_READONLY_PROPERTIES.get(TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER),
        });

        // As type is set explicitly leaving it in the init_data would break a loop below as it uses public interface to
        // initialise object's properties and type is a read-only property. We could enforce removing it from the inout
        // data but this would require to make such an operation in a couple of different places so it's easier to do it
        // here.
        delete init_data.type;

        this[_transaction_data].type = TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER;

        // We are initialising values passed in the init_data. We do it via the public interface hence we are enforcing
        // validity of the data.
        for (let property of TRANSACTION_ALLOWED_PROPERTIES.get(TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER)) {
            if (!this[property]) {
                this[property] = init_data[property];
            }
        }

        // If we didn't ask to initialise an empty object as described in _initialise_empty_object - set the default
        // values
        if (!init_data[_initialise_empty_object]) {
            this[_transaction_data].transaction_id = uuidv4();
            this[_transaction_data].status = TRANSACTION_STATUS__INITIAL;
            this[_transaction_data].account_id = init_data.account.account_id;
        }
    }


    /**
     * Properties' names that can be set via API. This structure is used by the static method [checkAPIProperties]{@link module:core/models/BaseModel/BaseModel#checkAPIProperties}
     * to validate if passed structure has only allowed properties and can be feed to constructor.
     * @returns {Set<Sring>>}
     * @static
     */
    static get API_PROPERTIES () { return TRANSACTION_API_PROPERTIES[TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER]; }


    /**
     * Extends the [BaseModel create]{@link module:core/models/BaseModel/BaseModel.create} by adding class specific
     * operations to be performed before object can be saved to the database.
     * As BlockchainTransferTransaction is not expected to stay in its initial state but instead to be completed right
     * after its creation, we are chaining the creation process with resolving the transaction.
     * @returns {Promise<BlockchainTransferTransaction>}
     * @async
     * @link module:core/models/BaseModel/BaseModel.create
     */
    async create () {
        await super.create();
        await this.resolve();

        return this;
    }


    /**
     * Implements the [BaseModel resolve]{@link module:core/models/BaseModel/BaseModel.resolve}. It's main purpose is to
     * complete a transaction by transfering funds to the blockchain.
     * @returns {Promise<BlockchainTransferTransaction>}
     * @async
     */
    async resolve () {
        this.checkRequiredProperties();

        // Mark transaction as processing to prevent any external modifications
        try {
            this.status = TRANSACTION_STATUS__PENDING;
            await this.save();
        }
        catch (e) {
            console.log('BlockchainTransferTransaction resolve init error', e);

            this.status = TRANSACTION_STATUS__INITIAL;
            throw e;
        }

        try {
            // Start by getting a list of all gathered coins in a given currency...
            let coins = await db.getCoinList(this.currency, this.account_id);
            coins = coins[this.currency];

            if (!coins || !coins.length) {
                throw new Error ('No coins in a given currency');
            }

            //...calculate coins value...
            let total_value = utils.coinsValue(coins);

            if (total_value < parseFloat(this.amount)) {
                throw new Error('Invalid value');
            }

            //...make sure that the actual coins' currency is the same as requested
            if (!coins.every(coin => this.currency === utils.Coin(c).c)) {
                throw new Error('Invalid value');
            }

            // Prepare a blockchain URI to be called to initialise transfer
            let blockchain_uri = `bitcoin:${this.address}?amount=${this.amount}`;

            if (this.description) {
                blockchain_uri += `&message=${encodeURIComponent(this.description)}}`;
            }

            if (this.label) {
                blockchain_uri += `&label=${encodeURIComponent(this.label)}`;
            }

            console.log('BlockchainTransferTransaction resolve', blockchain_uri, coins, this.amount, this.speed, this.account_id);

            this.status = TRANSACTION_STATUS__RESOLVED;

            // Mark transaction as resolved before actually making a transfer - we will revert it if it fails, but we
            // don't want to start a transfer and then fail during saving a transaction to the database as we can't
            // revert the transfer itself.
            await this.save();

            // Make an actual transfer
            this[_transaction_data].transfer_details = await utils.transferBitcoin(blockchain_uri, coins, this.amount, BLOCKCHAIN_TRANSFER_SPEED.get(this.speed), this.account_id);

            this[_transaction_data].completed = new Date();

            // If everything is fine, mark transaction as resolved
            await this.save();

            return this;
        }
        catch (e) {
            console.log('BlockchainTransferTransaction resolve error', e);

            try {
                // If we failed for any reason - revert to the initial state
                // TODO: to think - shouldn't we abort it instead?
                this.status = TRANSACTION_STATUS__INITIAL;
                await this.save();
            }
            catch (e) {
                console.log('BlockchainTransferTransaction resolve error - unable to revert transaction to initial', e);
            }

            throw e;
        }
    }


    /**
     * Method parsing and preparing data to be stored in the object's private data container. Its main purpose is to be
     * run after transaction is retrieved from the database to make sure that all sub-documents are restored to the
     * original form and have the right prototype assigned and not left as Objects.
     * @param input_data
     * @returns {Promise<Object>}
     */
    async prepareInputData(input_data) { return input_data; }
}


// TODO: implement CoinFileTransferTransaction
/**
 * Transaction type-specific class. It implements mechanisms to export gathered funds into the coin file.
 * @type {CoinFileTransferTransaction}
 * @extends CoreTransaction
 */
class CoinFileTransferTransaction extends CoreTransaction {}


/**
 * Proxy structure that maps transaction types to transaction classes that allows [the transaction factory class]{@link module:core/models/Transaction/Transaction}
 * to instanciate the right class.
 * This structure is initialised here as we need classes definitions to exist.
 * @private
 * @link module:core/models/Transaction~TRANSACTION_TYPES
 * @link module:core/models/Transaction/PaymentTransaction
 * @link module:core/models/Transaction/BlockchainTransferTransaction
 * @link module:core/models/Transaction/CoinFileTransferTransaction
 * @link module:core/models/Transaction/Transaction.constructor
 */
const TRANSACTION_CLASSES = new Map([
    [ TRANSACTION_TYPE__PAYMENT, PaymentTransaction, ],
    [ TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER, BlockchainTransferTransaction, ],
    [ TRANSACTION_TYPE__COIN_FILE_TRANSFER, CoinFileTransferTransaction, ],
]);

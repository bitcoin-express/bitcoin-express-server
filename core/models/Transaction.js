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

const db = require(config.get('system.root_dir') + '/db');
const checks = require(config.get('system.root_dir') + '/core/checks');
const utils = require(config.get('system.root_dir') + '/issuer/utils');
const issuer = require(config.get('system.root_dir') + '/issuer');
const endpoints = require(config.get('system.root_dir') + '/core/api/endpoints');
const errors = require(config.get('system.root_dir') + '/core/models/Errors');

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
 * 'aborted' transaction's status. Transaction was canceled, it's a terminal state and no more changes is allowed to it.
 * @type {string}
 * @const
 * @link module:core/models/Transactions~TRANSACTION_STATUSES
 */
const TRANSACTION_STATUS__ABORTED = 'aborted';


/**
 * 'expired' transaction's status. Transaction was not completed in time, it's a terminal state and no more changes is
 * allowed to it.
 * @type {string}
 * @const
 * @link module:core/models/Transactions~TRANSACTION_STATUSES
 */
const TRANSACTION_STATUS__EXPIRED = 'expired';


/**
 * 'processing' transaction's status. Transaction is being processed right now, changes can't be made in that state.
 * @type {string}
 * @const
 * @link module:core/models/Transactions~TRANSACTION_STATUSES
 */
const TRANSACTION_STATUS__PROCESSING = 'processing';


/**
 * Possible transaction statuses, shared among different types of transactions. It is possible that specific types of
 * transactions won't be supporting all statuses. If it's needed to verify the validity of transaction's status it can
 * be done by setting a transaction's [type-specific validator]{@link module:core/models/BaseModel/BaseModel.constructor}.
 * @type {Set}
 */
const TRANSACTION_STATUSES = new Set([
    TRANSACTION_STATUS__INITIAL,
    TRANSACTION_STATUS__RESOLVED,
    TRANSACTION_STATUS__ABORTED,
    TRANSACTION_STATUS__EXPIRED,
    TRANSACTION_STATUS__PROCESSING,
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
 * Properties available via the object's public interface as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * Each key holds a set of available keys for a corresponding transaction type.
 * @type {Map<Set>}
 * @private
 * @const
 */
const TRANSACTION_ALLOWED_PROPERTIES = new Map([
    [ TRANSACTION_TYPE__PAYMENT, new Set([ 'type', 'order_id', 'value', 'currency', 'description', 'notification',
            'return_url', 'callback_url', 'acceptable_issuers', 'email_customer_contact', 'policies', 'expires',
            'transaction_id', 'created', 'updated', 'seller', 'payment_url', 'status', 'account_id', 'confirmation_details',
            'verify_details', 'completed',
        ]),
    ],
    [ TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER, new Set([ 'transaction_id', 'status', 'type', 'currency', 'value',
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
    [ TRANSACTION_TYPE__PAYMENT, new Set([ 'type', 'value', 'currency', 'description', 'acceptable_issuers',
            'transaction_id', 'seller', 'payment_url', 'status', 'account_id',
        ]),
    ],
    [ TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER, new Set([ 'transaction_id', 'type', 'currency', 'value', 'address', ]), ],
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
    [ TRANSACTION_TYPE__PAYMENT, new Set([ 'account_id', ]), ],
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
    [ TRANSACTION_TYPE__PAYMENT, new Set([ 'acceptable_issuers', 'type', 'updated', 'completed', ]), ],
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
    value: (value) => {
        if (!value) { throw new Error ('Required field'); }
        if (!checks.isFloat(value) || value > 9999999999) { throw new Error('Invalid format'); }
        if (parseFloat(value) <= 0) { throw new Error('Invalid value'); }
    },
    description: BaseModel.VALIDATORS.description,
    notification: (text) => {
        if (text !== undefined && (typeof text !== "string" || text.length < 1 || text.length > 128)) {
            throw new Error('Invalid format');
        }
    },
    email_customer_contact: Account.VALIDATORS.email_customer_contact,
    policies: (policies) => {
        if (!policies) { return true; }

        if (typeof policies !== "object") { throw new Error('Invalid format'); }

        let allowed_policies = [ 'receipt_via_email', 'refund_via_email', ];
        for (let policy of Object.keys(policies)) {
            if (!allowed_policies.includes(policy)) { throw new Error ('Unknown policy'); }
            else if (typeof policies[policy] !== typeof true) { throw new Error ('Invalid format'); }
        }
    },
    currency: Settings.VALIDATORS.default_payment_currency,
    status: status => {
        if (!TRANSACTION_STATUSES.has(status)) { throw new Error('Unknown status'); }
    },
    confirmation_details: details => true,
    verify_details: details => true,
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
};

// We are sealing the structure to prevent any modifications
BaseModel.lockPropertiesOf(_transaction_properties_custom_getters);


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
     * Publicly exposed INITIAL status, described in {@link module:core/models/Transaction~TRANSACTION_STATUS__PROCESSING}
     * @returns {String}
     * @static
     */
    static get STATUS__PROCESSING () { return TRANSACTION_STATUS__PROCESSING; }


    /**
     * Publicly exposed INITIAL status, described in {@link module:core/models/Transaction~TRANSACTION_STATUS__RESOLVED}
     * @returns {String}
     * @static
     */
    static get STATUS__RESOLVED () { return TRANSACTION_STATUS__RESOLVED; }


    /**
     * Publicly exposed INITIAL status, described in {@link module:core/models/Transaction~TRANSACTION_STATUS__ABORTED}
     * @returns {String}
     * @static
     */
    static get STATUS__ABORTED () { return TRANSACTION_STATUS__ABORTED; }


    /**
     * Publicly exposed INITIAL status, described in {@link module:core/models/Transaction~STATUS__EXPIRED}
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
     * @param {boolean} only_valid - return only records in non-terminal statuses: resolved, initial, processing
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
            else if (only_valid) {
                query.status = { $in: [
                        TRANSACTION_STATUS__INITIAL,
                        TRANSACTION_STATUS__RESOLVED,
                        TRANSACTION_STATUS__PROCESSING, ]
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
     * @param {Set} required_properties
     * @param {Set} hidden_properties
     * @param {Set} readonly_properties
     */
    constructor({ allowed_properties, required_properties, hidden_properties, readonly_properties, }) {
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
            db_table: 'transactions',
            db_id_field: 'transaction_id',
        });
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
            required_properties: TRANSACTION_REQUIRED_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT),
            hidden_properties: TRANSACTION_HIDDEN_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT),
            readonly_properties: TRANSACTION_READONLY_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT),
        });

        // As type is set explicitly leaving it in the init_data would break a loop below as it uses public interface to
        // initialise object's properties and type is a read-only property. We could enforce removing it from the inout
        // data but this would require to make such an operation in a couple of different places so it's easier to do it
        // here.
        delete init_data.type;

        // We are initialising values passed in the init_data. We do it via the public interface hence we are enforcing
        // validity of the data.
        for (let property of TRANSACTION_ALLOWED_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT)) {
            if (init_data[property]) {
                this[property] = init_data[property];
            }
        }

        this[_transaction_data].type = TRANSACTION_TYPE__PAYMENT;

        // If we didn't ask to initialise an empty object as described in _initialise_empty_object - set the default
        // values
        if (!init_data[_initialise_empty_object]) {
            this[_transaction_data].transaction_id = uuidv4();
            this[_transaction_data].status = TRANSACTION_STATUS__INITIAL;
            this[_transaction_data].account_id = init_data.account.account_id;
            this[_transaction_data].acceptable_issuers = init_data.account.settings.acceptable_issuers;

            this.return_url = init_data.return_url || init_data.account.settings.return_url || undefined;
            this[_transaction_data].seller = this.return_url ? new URL(this.return_url).hostname : init_data.account.domain;
            this.callback_url = init_data.callback_url || init_data.account.settings.callback_url || undefined;

            this[_transaction_data].created = new Date();
            this.expires = init_data.expires ?
                           (
                               init_data.expires instanceof Date ?
                               init_data.expires :
                               new Date(init_data.expires)
                           ) :
                           new Date(this.created.getTime() + init_data.account.settings.default_payment_timeout * 1000);

            this.email_customer_contact = init_data.email_customer_contact || init_data.account.email_customer_contact;

            this.policies = {
                receipt_via_email: init_data.policies && init_data.policies.hasOwnProperty('receipt_via_email') ?
                                   init_data.policies.receipt_via_email :
                                   init_data.account.settings.provide_receipt_via_email,
                refund_via_email: init_data.policies && init_data.policies.hasOwnProperty('refund_via_email') ?
                                  init_data.policies.refund_via_email :
                                  init_data.account.settings.provide_refund_via_email,
            };

            this.currency = init_data.currency || init_data.account.settings.default_payment_currency;

            if (!this.return_url && !this.notification) {
                throw new Error('Either return_url or notification is required');
            }
        }
    }


    /**
     * Method parsing and preparing data to be stored in the object's private data container. Its main purpose is to be
     * run after transaction is retrieved from the database to make sure that all sub-documents are restored to the
     * original form and have the right prototype assigned and not left as Objects
     * @param input_data
     * @returns {Promise<Object>}
     */
    async prepareInputData(input_data) {
        if (input_data.confirmation_details && !(input_data.confirmation_details instanceof PaymentConfirmation)) {
            input_data.confirmation_details = new PaymentConfirmation(input_data.confirmation_details);
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
    async create() {
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

        // Assuming we've found a transaction and it's not in a terminal state...
        if (existing_transaction &&
            existing_transaction.status !== Transaction.STATUS__ABORTED &&
            existing_transaction.status !== Transaction.STATUS__EXPIRED
        ) {
            //...if it's still proceeding we need to throw...
            if (existing_transaction.status === Transaction.STATUS__PROCESSING) {
                throw new errors.InvalidValueError({ message: `Transaction with order_id ${this.order_id} is currently being processed.`});
            }
            //...if it's already resolved we need to throw...
            else if (existing_transaction.status === Transaction.STATUS__RESOLVED) {
                throw new errors.InvalidValueError({ message: `Transaction with order_id ${this.order_id} is already resolved.`});
            }
            //...if it's still in the initial status we can update it...
            else if (existing_transaction.status === Transaction.STATUS__INITIAL) {
                let changes = {};

                // As we want to save the history of changes we need to find out what properties were updated...
                for (let property of TRANSACTION_ALLOWED_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT)) {
                    if (this[property] !== existing_transaction[property]) {
                        changes[property] = this[property] || '';
                    }
                }

                //...and if there were any - store them in a non-exposed property of the transaction object
                if (Object.keys(changes).length) {
                    if (!this[_transaction_data]._updates_history) {
                        this[_transaction_data]._updates_history = [];
                    }

                    changes._updated = new Date();
                    this[_transaction_data]._updates_history.push(changes);
                }

                this[_transaction_data].created = existing_transaction.created;
                this[_transaction_data].transaction_id = existing_transaction.transaction_id;

                await this.save();
            }
        }
        //... and if we didn't find a transaction in a non-terminal state - create a new one
        else {
            await super.create();
        }

        try {
            let timeout = this.expires - new Date();

            // We want to automatically expire the transaction after a set time hence we need to schedule an expiry
            // action
            setTimeout(() => {
                let query = {
                    transaction_id: { $eq: this.transaction_id, },
                    status: { $eq: TRANSACTION_STATUS__INITIAL, },
                };

                console.log("Transaction expired - " + this.transaction_id);
                db.findAndModify('transactions', query, { status: TRANSACTION_STATUS__EXPIRED, });
            }, timeout * 1000);
        }
        catch (e) {
            throw new errors.Warning ({class_name: this.constructor.name, field: 'create', message: 'Transaction created, but failed to set the expiration timeout'});
        }

        return this;
    }


    /**
     * Implements the [BaseModel resolve]{@link module:core/models/BaseModel/BaseModel.resolve}. It's main purpose is to
     * complete a transaction by accepting a payment confirmation from the Buyer and returning PaymentAck as defined in
     * Bitcoin-Express Payment specification.
     * @param {PaymentConfirmation} payment_confirmation_details
     * @returns {Promise<PaymentAck>}
     * @async
     * @link module:core/models/PaymentConfirmation
     * @link module:core/models/PaymentAck
     */
    async resolve (payment_confirmation_details) {
        this.checkRequiredProperties();

        // We are building an initial PaymentAck object as we will always return it
        let payment_ack = new PaymentAck({
            status: PaymentAck.STATUS__OK,
            seller: this.seller,
        });

        // If transaction is already completed - return the original PaymentAck
        if (this.status === TRANSACTION_STATUS__RESOLVED) {
            payment_ack.wallet_id = this.confirmation_details.wallet_id;
            payment_ack.return_url = this.return_url;
            payment_ack.memo = this.notification;

            return payment_ack;
        }
        // Payment specification is not recognizing this state hence we are throwing an error - API should take care
        // about it on its own
        else if (this.status === TRANSACTION_STATUS__PROCESSING) {
            throw new Error("A payment is already being processed for this transaction");
        }
        else if (this.status === TRANSACTION_STATUS__EXPIRED) {
            payment_ack.status = PaymentAck.STATUS__AFTER_EXPIRES;
            return payment_ack;
            // throw new Error("Transaction expired");
        }
        else if (!payment_confirmation_details.coins.every(coin => this.currency === utils.Coin(coin).c)) {
            payment_ack.status = PaymentAck.STATUS__BAD_COINS;
            return payment_ack;
            // throw new Error("Some coins are not from the requested currency");
        }
        else if (utils.coinsValue(payment_confirmation_details.coins) < this.value) {
            payment_ack.status = PaymentAck.STATUS__INSUFFICIENT_AMOUNT;
            return payment_ack;
            // throw new Error("The value of sent coins is not enough");
        }

        let coins_domain = utils.Coin(payment_confirmation_details.coins[0]).d;

        if (!payment_confirmation_details.coins.every((coin) => {
            coin = utils.Coin(coin);
            return (
                this.acceptable_issuers.includes(coin.d) ||
                this.acceptable_issuers.includes(`(${coin.d})`)
            ) && coin.d === coins_domain;
        })) {
            payment_ack.status = PaymentAck.STATUS__BAD_COINS;
            return payment_ack;
            // throw new Error(`Some coins are not from the list of acceptable issuers or selected coins are from different issuers.`);
        }

        // Mark current transaction as processing and save confirmation details so - in case operation fails - we can
        // retry
        this.status = TRANSACTION_STATUS__PROCESSING;
        this.confirmation_details = payment_confirmation_details;

        // All operations should be performed inside a transaction so we can revert everything in case of an error
        let db_session = db.getClient().startSession();
        await db_session.startTransaction();

        let issuer_begin_response, account;

        try {
            this.initDBSession(db_session);

            // We need to find the account object, begin the verification procedure on the Issuer's end and save current
            // transaction in its processing state. All this can be done in parallel but we can't proceed unless its
            // done.
            [ account, issuer_begin_response, ] = await Promise.all([
                Account.find(this.account_id),
                issuer.post('begin', { issuerRequest: { fn: "verify", } }, coins_domain),
                this.save(),
            ]);

            if (!account) {
                throw new Error("Payment account does not exist");
            }

            /* TODO: commiting transaction here brings a risk of transaction stuck in the processing status if
                verification fails for any reason. For now I will try to revert transaction back to initial state and
                remove confirmation details in catch block but this is not a perfect solution as save in catch block
                can fail as well.
                On the other hand if transaction fails after this commit for example on verify level, we may try to proceed
                it later on one more time as we have all the details saved.
                Currently if anything breaks and throws error in this try/catch block I'm trying to revert transaction to
                it's original state with initial status
             */
            // Commit to set transaction as processing in order to prevent new payments of modifying this transaction
            await db_session.commitTransaction();

            // Begin verification procedure for delivered coins
            let issuer_verify_response = await issuer.post('verify', {
                issuerRequest: {
                    tid: issuer_begin_response.issuerResponse.headerInfo.tid,
                    expiry: this.expires,
                    coin: payment_confirmation_details.coins,
                    targetValue: this.value,
                    issuePolicy: "single",
                }
            }, coins_domain);

            let verified_coins = issuer_verify_response.issuerResponse.coin;
            let verify_info = issuer_verify_response.issuerResponse.verifyInfo;

            if (verify_info.actualValue < this.value) {
                payment_ack.status = PaymentAck.STATUS__INSUFFICIENT_AMOUNT;
                return payment_ack;
                // throw new Error("The value of verified coins is not enough");
            }

            // TODO: make a class
            let coin_data = {
                account_id: this.account_id,
                coins: verified_coins,
                currency: this.currency,
                date: new Date(),
                value: verify_info.actualValue,
                transaction_id: this.transaction_id,
            };

            if (payment_confirmation_details.memo) {
                coin_data.memo = payment_confirmation_details.memo;
            }

            if (payment_confirmation_details.client_type) {
                coin_data.client_type = payment_confirmation_details.client_type;
            }

            if (this.order_id) {
                coin_data.order_id = this.order_id;
            }

            this.status = TRANSACTION_STATUS__RESOLVED;
            this.verify_details = verify_info;
            this.completed = new Date();

            // TODO: add coins encryption before saving them in the database
            // Store verified coins in the database and save current transaction with resolved status. We can do it in
            // parallel
            await Promise.all([
                db.insert('coins', coin_data),
                this.save(),
            ]);

            // Try to finish transaction on the Issuers end...
            try {
                issuer.post('end', {
                    issuerRequest: {
                        tid: issuer_begin_response.issuerResponse.headerInfo.tid
                    }
                }, coins_domain).catch(e => console.log("Couldn't close transaction on the Issuer's end", e));
            }
            //... but we don't really care if we couldn't
            catch (e) {
                console.log("Couldn't close transaction on the Issuer's end", e);
            }

            payment_ack.wallet_id = payment_confirmation_details.wallet_id;
            payment_ack.return_url = this.return_url;
            payment_ack.memo = this.notification;

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
                if (coins_domain && issuer_begin_response) {
                    issuer.post('end', {
                        issuerRequest: {
                            tid: issuer_begin_response.issuerResponse.headerInfo.tid
                        }
                    }, coins_domain);
                }
            }
            catch (e) {
                console.log("Failed during sending 'end' to an issuer: " + e.toString());
            }

            await db_session.abortTransaction();

            // We are trying to revert transaction to its initial state so it can be processed once again
            try {
                this.status = TRANSACTION_STATUS__INITIAL;
                this.confirmation_details = undefined;
                await db_session.startTransaction();
                await this.save();
                await db_session.commitTransaction();
            }
            catch (e) {
                console.log("Failed during finalising payment - unable to revert transaction to original state: " + e.toString());
            }

            throw e;
        }
        finally {
            this.closeDBSession();
            await db_session.endSession();
        }
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
            this.status = TRANSACTION_STATUS__PROCESSING;
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

            if (total_value < parseFloat(this.value)) {
                throw new Error('Invalid value');
            }

            //...make sure that the actual coins' currency is the same as requested
            if (!coins.every(coin => this.currency === utils.Coin(c).c)) {
                throw new Error('Invalid value');
            }

            // Prepare a blockchain URI to be called to initialise transfer
            let blockchain_uri = `bitcoin:${this.address}?amount=${this.value}`;

            if (this.description) {
                blockchain_uri += `&message=${encodeURIComponent(this.description)}}`;
            }

            if (this.label) {
                blockchain_uri += `&label=${encodeURIComponent(this.label)}`;
            }

            console.log('BlockchainTransferTransaction resolve', blockchain_uri, coins, this.value, this.speed, this.account_id);

            this.status = TRANSACTION_STATUS__RESOLVED;

            // Mark transaction as resolved before actually making a transfer - we will revert it if it fails, but we
            // don't want to start a transfer and then fail during saving a transaction to the database as we can't
            // revert the transfer itself.
            await this.save();

            // Make an actual transfer
            this[_transaction_data].transfer_details = await utils.transferBitcoin(blockchain_uri, coins, this.value, BLOCKCHAIN_TRANSFER_SPEED.get(this.speed), this.account_id);

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

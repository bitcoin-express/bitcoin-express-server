"use strict";

/**
 * This module defines the PaymentAck class, a container for [the payment method response]{@link module:core/api/actions.postTransactionByIdPayment}
 * and strictly follows the Bitcoin-Express Payment specification.
 * @module core/models/PaymentAck
 * @link module:core/models/Transaction
 * @link module:core/models/BaseModel
 */

const config = require('config');

const errors = require(config.get('system.root_dir') + '/core/models/Errors');
const checks = require(config.get('system.root_dir') + '/core/checks');
const { BaseModel } = require(config.get('system.root_dir') + '/core/models/BaseModel');
const { Account } = require(config.get('system.root_dir') + '/core/models/Account');
const { PaymentConfirmation } = require(config.get('system.root_dir') + '/core/models/PaymentConfirmation');
const { Settings } = require(config.get('system.root_dir') + '/core/models/Settings');


/**
 * Status indicating that everything went well and the payment is now complete.
 * This status is exposed via [PaymentAck]{@link module:core/models/PaymentAck/PaymentAck} public interface.
 * @type {string}
 * @const
 * @private
 */
const PAYMENT_ACK_STATUS__OK = 'ok';


/**
 * Status indicating that there was an error, most likely a temporary one, and that it's worth to retry the operation. 
 * This status is exposed via [PaymentAck]{@link module:core/models/PaymentAck/PaymentAck} public interface.
 * @type {string}
 * @const
 * @private
 */
const PAYMENT_ACK_STATUS__DEFERRED = 'deferred';


/**
 * Status indicating that the payment was recognized but for for some reason it was rejected.
 * This status is exposed via [PaymentAck]{@link module:core/models/PaymentAck/PaymentAck} public interface.
 * @type {string}
 * @const
 * @private
 */
const PAYMENT_ACK_STATUS__REJECTED = 'rejected';


/**
 * Status indicating that there was an unknown, generic error while processing the payment.
 * This status is exposed via [PaymentAck]{@link module:core/models/PaymentAck/PaymentAck} public interface.
 * @type {string}
 * @const
 * @private
 */
const PAYMENT_ACK_STATUS__FAILED = 'failed';


/**
 * Statuses defined and required by the Bitcoin-Express payment specification, exposed via
 * [PaymentAck]{@link module:core/models/PaymentAck/PaymentAck} public interface.
 * @type {Set}
 */
const PAYMENT_ACK_STATUSES = new Set([
    PAYMENT_ACK_STATUS__OK,
    PAYMENT_ACK_STATUS__REJECTED,
    PAYMENT_ACK_STATUS__FAILED,
    PAYMENT_ACK_STATUS__DEFERRED,
]);


/**
 * Symbol to be used to conceal private data container inside the PaymentAck object as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Symbol}
 * @private
 * @const
 */
const _payment_ack_data = Symbol('_payment_ack_data');


/**
 * Symbol to be used to conceal private interface container inside the PaymentAck object as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Symbol}
 * @private
 * @const
 */
const _payment_ack_interface = Symbol('_payment_ack_interface');


/**
 * Symbol to be used to store database session id inside the PaymentAck object as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Symbol}
 * @private
 * @const
 */
const _db_session = Symbol('_db_session');


/**
 * Set of keys defining properties available via the object's public interface as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Set}
 * @private
 * @const
 */
const PAYMENT_ACK_ALLOWED_PROPERTIES = new Set([ 'status', 'return_url', 'notification', 'seller', 'wallet_id', 'coins', 'created', 'updated', 'retry_after', 'reference', 'recovery', 'ack_passthrough', ]);


/**
 * Set of keys defining properties required by the object before it can be saved in the database as described in {@link module:core/models/BaseModel/BaseModel.constructor}.
 * @type {Set}
 * @private
 * @const
 */
const PAYMENT_ACK_REQUIRED_PROPERTIES = new Set([ 'status', 'wallet_id', ]);


/**
 * Set of keys defining read-only properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}.
 * This properties can be read via the public interface but set only via object's private interface.
 * @type {Set}
 * @private
 * @const
 */
const PAYMENT_ACK_READONLY_PROPERTIES = new Set([ 'created', 'updated', ]);


/**
 * Set of keys defining properties hidden from stringification as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Set}
 * @private
 * @const
 */
const PAYMENT_ACK_HIDDEN_PROPERTIES = new Set([ 'created', 'updated', ]);


/**
 * Structure defining validators for PaymentAck's properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {object}
 * @private
 */
const _payment_ack_properties_validators = {
    status: (status) => { if (!PAYMENT_ACK_STATUSES.has(status)) { throw new errors.InvalidValueError(); }},
    return_url: Settings.VALIDATORS.return_url,
    notification: BaseModel.VALIDATORS.notification,
    seller: Account.VALIDATORS.domain,
    wallet_id: PaymentConfirmation.VALIDATORS.wallet_id,
    coins: PaymentConfirmation.VALIDATORS.coins,
    retry_after: (seconds) => { if (!checks.isInteger(seconds)) { throw new errors.InvalidValueError(); }},
    reference: (reference) => {
        if (typeof reference !== "object") {
            throw new Error('Invalid format');
        }

        if (!Object.keys(reference).every((key) => [ 'issuer', 'id', ].includes(key))) {
            throw new Error ('Invalid key');
        }

        if (!reference.issuer || !checks.isDomain(reference.issuer)) {
            throw new Error ('Invalid format');
        }

        if (!reference.id || typeof reference.id !== "string" || reference.id.length < 1 || reference.id.length > 64) {
            throw new Error ('Invalid format');
        }
    },
    recovery: (recovery) => {
        if (typeof recovery !== "object") {
            throw new Error('Invalid format');
        }

        if (!Object.keys(recovery).every((key) => [ 'issuer', 'tid', 'expiry', ].includes(key))) {
            throw new Error ('Invalid key');
        }

        if (!recovery.issuer || !checks.isDomain(recovery.issuer)) {
            throw new Error ('Invalid format');
        }

        if (!recovery.tid || typeof recovery.tid !== "string" || recovery.tid.length < 1 || recovery.tid.length > 64) {
            throw new Error ('Invalid format');
        }

        if (!recovery.expiry || !checks.isDate(recovery.expiry)) {
            throw new Error ('Invalid format');
        }
    },
    ack_passthrough: (value) => { if (typeof value !== "string" || value.length > 1024) { throw new Error ('Invalid format'); } },
};

// We are sealing the structure to prevent any modifications
BaseModel.lockPropertiesOf(_payment_ack_properties_validators);


/**
 * Structure defining custom getters for PaymentAck's properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {object}
 * @private
 */
const _payment_ack_properties_custom_getters = {};

// We are sealing the structure to prevent any modifications
BaseModel.lockPropertiesOf(_payment_ack_properties_custom_getters);


/**
 * Structure defining custom setters for PaymentAck's properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {object}
 * @private
 */
const _payment_ack_properties_custom_setters = {};

// We are sealing the structure to prevent any modifications
BaseModel.lockPropertiesOf(_payment_ack_properties_custom_setters);


/**
 * Class representing the response from the transaction's payment. It is strictly following Bitcoin-Express Payment
 * specification and implementing its requirements. Objects of this class are not stored in the database but build
 * ad-hoc to generate an API response.
 * @type {PaymentAck}
 * @extends BaseModel
 */
exports.PaymentAck = class PaymentAck extends BaseModel {
    /**
     * Constructor accepts initial properties' values and initialises BaseModel mechanisms by calling the super
     * constructor and passing locally-defined structures as described in {@link module:core/models/BaseModel/BaseModel.constructor}
     * @param init_data
     */
    constructor (init_data={}) {
        super ({
            private_data_container_key: _payment_ack_data,
            private_interface_key: _payment_ack_interface,
            db_session_id: _db_session,
            custom_getters: _payment_ack_properties_custom_getters,
            custom_setters: _payment_ack_properties_custom_setters,
            validators: _payment_ack_properties_validators,
            allowed_properties: PAYMENT_ACK_ALLOWED_PROPERTIES,
            required_properties: PAYMENT_ACK_REQUIRED_PROPERTIES,
            hidden_properties: PAYMENT_ACK_HIDDEN_PROPERTIES,
            readonly_properties: PAYMENT_ACK_READONLY_PROPERTIES,
            db_table: undefined,
            db_id_field: undefined,
        });

        for (let property of PAYMENT_ACK_ALLOWED_PROPERTIES) {
            if (!this[property] && init_data[property]) {
                this[property] = init_data[property];
            }
        }
    }


    /**
     * A public interface to access class specific validators. This is needed if a different class will have the same
     * property, to reuse its validator, instead of reimplementing it.
     * @returns {Object}
     * @static
     */
    static get VALIDATORS () { return _payment_ack_properties_validators; }


    /**
     * Set of available PaymentAck statuses
     * @returns {Set}
     * @static
     */
    static get STATUSES () { return PAYMENT_ACK_STATUSES; }


    /**
     * Publicly exposed OK status, described in {@link module:core/models/PaymentAck~PAYMENT_ACK_STATUS__OK}
     * @returns {string}
     * @static
     */
    static get STATUS__OK () { return PAYMENT_ACK_STATUS__OK; }


    /**
     * Publicly exposed FAILED status, described in {@link module:core/models/PaymentAck~PAYMENT_ACK_STATUS__FAILED}
     * @returns {string}
     * @static
     */
    static get STATUS__FAILED () { return PAYMENT_ACK_STATUS__FAILED; }


    /**
     * Publicly exposed REJECTED status, described in {@link module:core/models/PaymentAck~PAYMENT_ACK_STATUS__REJECTED}
     * @returns {string}
     * @static
     */
    static get STATUS__REJECTED () { return PAYMENT_ACK_STATUS__REJECTED; }


    /**
     * Publicly exposed ISSUER_ERROR status, described in {@link module:core/models/PaymentAck~PAYMENT_ACK_STATUS__DEFERRED}
     * @returns {string}
     * @static
     */
    static get STATUS__DEFERRED () { return PAYMENT_ACK_STATUS__DEFERRED; }

    toJSON() {
        return { PaymentAck: this };
    }
};

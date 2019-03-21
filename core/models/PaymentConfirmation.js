"use strict";

/**
 * This module defines the PaymentConfirmation class, a container for payment transaction's confirmation data send by
 * the Buyer to resolve the transaction as defined in the Bitcoin-Express payment specification.
 * @module core/models/PaymentConfirmation
 * @link module:core/models/Transaction
 * @link module:core/models/BaseModel
 */

const config = require('config');
const checks = require(config.get('system.root_dir') + '/core/checks');

const { BaseModel } = require(config.get('system.root_dir') + '/core/models/BaseModel');


/**
 * Possible types of API consumers:
 * - web - for websites,
 * - app - for all kinds of applications.
 * @type {Set}
 * @const
 */
const PAYMENT_CONFIRMATION_CLIENT_TYPES = new Set ([ 'web', 'app', ]);


/**
 * Possible options available to be defined by the Buyer:
 * - language_preference - the ISO language code of the Buyer's preferred language (including email communications).
 * If the merchant is able to respond in this language they should do so,
 * - send_receipt_to - object defining if and where to send a receipt to the Buyer,
 * - send_refund_to - object defining if and where to send a refund to the Buyer,
 * - send_issuer_refund_to - object defining if and where the Issuer should send a refund to the Buyer - if supported.
 * @type {Set}
 */
const PAYMENT_CONFIRMATION_OPTION = new Set([ 'language_preference', 'send_receipt_to', 'send_refund_to', 'send_issuer_refund_to', 'notification', ]);


/**
 * Symbol to be used to conceal private data container inside the PaymentConfirmation object as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Symbol}
 * @private
 * @const
 */
const _confirmation_data = Symbol('_confirmation_data');


/**
 * Symbol to be used to conceal private interface container inside the PaymentConfirmation object as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Symbol}
 * @private
 * @const
 */
const _confirmation_interface = Symbol('_confirmation_interface');


/**
 * Symbol to be used to store database session id inside the PaymentConfirmation object as described in {@link module:core/models/BaseModel/BaseModel.constructor}
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
const PAYMENT_CONFIRMATION_ALLOWED_PROPERTIES = new Set ([ 'coins', 'wallet_id', 'client', 'options', 'created', 'updated', 'verify_info', 'transaction_id', 'order_id', 'verify_tid', 'verify_expiry', ]);


/**
 * Set of keys that are available to be set via API as described in {@link module:core/models/BaseModel/BaseModel.constructor}.
 * @type {Set}
 * @private
 * @const
 */
const PAYMENT_CONFIRMATION_API_PROPERTIES = new Set([ 'coins', 'wallet_id', 'client', 'options', ]);


/**
 * Set of keys defining properties required by the object before it can be saved in the database as described in {@link module:core/models/BaseModel/BaseModel.constructor}.
 * @type {Set}
 * @private
 * @const
 */
const PAYMENT_CONFIRMATION_REQUIRED_PROPERTIES = new Set([ 'coins', ]);


/**
 * Set of keys defining properties hidden from stringification as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Set}
 * @private
 * @const
 */
const PAYMENT_CONFIRMATION_HIDDEN_PROPERTIES = new Set([ 'created', 'updated', 'verify_tid', 'verify_expiry', ]);


/**
 * Set of keys defining read-only properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}.
 * This properties can be read via the public interface but set only via object's private interface.
 * @type {Set}
 * @private
 * @const
 */
const PAYMENT_CONFIRMATION_READONLY_PROPERTIES = new Set([ 'created', 'updated', ]);


/**
 * Structure defining validators for PaymentConfirmation's properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {object}
 * @private
 */
const _confirmation_properties_validators = {
    verify_info: verify_info => true,
    verify_tid: verify_tid => true,
    verify_expiry: verify_expiry => { if (!checks.isDate(verify_expiry)) { throw new Error ('Invalid format'); } },
    transaction_id: transaction_id => true,
    order_id: order_id => true,
    coins: coins => {
        if (!coins) { throw new Error ('Field required'); }
        if (!Array.isArray(coins)) { throw new Error ('Invalid format'); }
        if (coins.length < 1) { throw new Error ('Invalid format'); }

        // All coins should be valid base64 strings - in order to do that we are trying to decode and re-encode them to
        // check if the base64 was valid
        for (let coin of coins) {
            if (Buffer.from(coin, 'base64').toString('base64') !== coin) {
                throw new Error ('Invalid coin format');
            }
        }
    },
    wallet_id: wallet_id => {
        if (typeof wallet_id !== "string" || wallet_id.length < 1 || wallet_id.length > 36) {
            throw new Error ('Invalid format');
        }
    },
    client: client_type => {
        if (!PAYMENT_CONFIRMATION_CLIENT_TYPES.has(client_type)) { throw new Error ('Invalid value'); }
    },
    options: options => {
        if (!options) { return true; }
        if (typeof options !== "object") { throw new Error('Invalid format'); }
        if (!Object.keys(options).every((option) => PAYMENT_CONFIRMATION_OPTION.has(option))) { throw new Error ('Invalid key'); }
        if (options.language_preference && options.language_preference > 10) { throw new Error ('Invalid format'); }

        if (options.send_receipt_to) {
            if (typeof options.send_receipt_to !== "object") {
                throw new Error ('Invalid format');
            }

            if (!Object.keys(options.send_receipt_to).every((option) => [ 'email', ].includes(option))) {
                throw new Error ('Invalid key');
            }

            if (!options.send_receipt_to.email || !checks.isEmail(options.send_receipt_to.email)) {
                throw new Error ('Invalid format');
            }
        }

        if (options.send_refund_to) {
            if (typeof options.send_refund_to !== "object") {
                throw new Error('Invalid format');
            }

            if (!Object.keys(options.send_refund_to).every((option) => [ 'email', 'password', 'reference', ].includes(option))) {
                throw new Error ('Invalid key');
            }

            if (!options.send_refund_to.email || !checks.isEmail(options.send_refund_to.email)) {
                throw new Error ('Invalid format');
            }

            if (options.send_refund_to.password && (typeof options.send_refund_to.password !== "string" ||
                options.send_refund_to.password.length < 8 || options.send_refund_to.password.length > 64)) {
                throw new Error ('Invalid format');
            }

            if (options.send_refund_to.reference && typeof options.send_refund_to.reference !== "string") {
                throw new Error ('Invalid format');
            }
        }

        if (options.send_issuer_refund_to) {
            if (typeof options.send_issuer_refund_to !== "object") {
                throw new Error('Invalid format');
            }

            if (!Object.keys(options.send_issuer_refund_to).every((option) => [ 'email', 'password', 'reference', ].includes(option))) {
                throw new Error ('Invalid key');
            }

            if (!options.send_issuer_refund_to.email || !checks.isEmail(options.send_issuer_refund_to.email)) {
                throw new Error ('Invalid format');
            }

            if (options.send_issuer_refund_to.password && (typeof options.send_issuer_refund_to.password !== "string" ||
                options.send_issuer_refund_to.password.length < 8 || options.send_issuer_refund_to.password.length > 64)) {
                throw new Error ('Invalid format');
            }

            if (options.send_issuer_refund_to.reference && (typeof options.send_issuer_refund_to.reference !== "string" ||
                options.send_issuer_refund_to.reference.length < 8 || options.send_issuer_refund_to.reference.length > 64)) {
                throw new Error ('Invalid format');
            }
        }

        if (options.notification) {
            if (typeof options.notification !== "string" || options.notification.length < 1 || options.notification.length > 256) { throw new Error ('Invalid format'); }
        }
    },
};

// We are sealing the structure to prevent any modifications
BaseModel.lockPropertiesOf(_confirmation_properties_validators);


/**
 * Structure defining custom getters for PaymentConfirmations's properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {object}
 * @private
 */
const _confirmation_properties_custom_getters = {};

// We are sealing the structure to prevent any modifications
BaseModel.lockPropertiesOf(_confirmation_properties_custom_getters);


/**
 * Structure defining custom setters for PaymentConfirmations's properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {object}
 * @private
 */
const _confirmation_properties_custom_setters = {};

// We are sealing the structure to prevent any modifications
BaseModel.lockPropertiesOf(_confirmation_properties_custom_setters);


/**
 * Class representing the confirmation of [payment transaction]{@link module:core/models/Transaction/PaymentTransaction}
 * send by the buyer to resolve a transaction. It's following recommendations defined by the Bitcoin-Express Payment
 * specification. Objects of this class are not stored in the database as separate records but instead bind with a
 * corresponding transaction object and saved as its sub-document.
 * @type {PaymentConfirmation}
 * @extends BaseModel
 */
exports.PaymentConfirmation = class PaymentConfirmation extends BaseModel {
    /**
     * Constructor accepts initial properties' values and initialises BaseModel mechanisms by calling the super
     * constructor and passing locally-defined structures as described in {@link module:core/models/BaseModel/BaseModel.constructor}
     * @param init_data
     */
    constructor (init_data={}) {
        super ({
            private_data_container_key: _confirmation_data,
            private_interface_key: _confirmation_interface,
            db_session_id: _db_session,
            custom_getters: _confirmation_properties_custom_getters,
            custom_setters: _confirmation_properties_custom_setters,
            validators: _confirmation_properties_validators,
            allowed_properties: PAYMENT_CONFIRMATION_ALLOWED_PROPERTIES,
            api_properties: PAYMENT_CONFIRMATION_API_PROPERTIES,
            required_properties: PAYMENT_CONFIRMATION_REQUIRED_PROPERTIES,
            hidden_properties: PAYMENT_CONFIRMATION_HIDDEN_PROPERTIES,
            readonly_properties: PAYMENT_CONFIRMATION_READONLY_PROPERTIES,
            db_table: undefined,
            db_id_field: undefined,
        });

        for (let property of PAYMENT_CONFIRMATION_ALLOWED_PROPERTIES) {
            if (!this[property] && init_data[property]) {
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
    static get API_PROPERTIES () { return PAYMENT_CONFIRMATION_API_PROPERTIES; }

    /**
     * A public interface to access class specific validators. This is needed if a different class will have the same
     * property, to reuse its validator, instead of reimplementing it.
     * @returns {Object}
     * @static
     */
    static get VALIDATORS () { return _confirmation_properties_validators; }
};

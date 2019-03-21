"use strict";

/**
 * This module defines the Settings class, a container for [the Merchant's account]{@link module:core/models/Account}
 * configuration. It is tightly connected to [the Gateway configuration]{@link Config} and reuses some of its options.
 * @module core/models/Settings
 * @link module:core/models/Account
 * @link Config
 * @link module:core/models/BaseModel
 */

const config = require('config');
const db = require(config.get('system.root_dir') + '/db');
const checks = require(config.get('system.root_dir') + '/core/checks');

const { BaseModel } = require(config.get('system.root_dir') + '/core/models/BaseModel');


/**
 * Symbol to be used to conceal private data container inside the Settings object as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Symbol}
 * @private
 * @const
 */
const _settings_data = Symbol('_settings_data');


/**
 * Symbol to be used to conceal private interface container inside the Settings object as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Symbol}
 * @private
 * @const
 */
const _settings_interface = Symbol('_settings_interface');


/**
 * Symbol to be used to store database session id inside the Settings object as described in {@link module:core/models/BaseModel/BaseModel.constructor}
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
const SETTINGS_ALLOWED_PROPERTIES = new Set(Object.keys(config.get('account.settings')));


/**
 * Set of keys defining properties available via the object's public interface as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * In this case we want to allow for all keys defined in the Gateway configuration minus the keys set as read-only.
 * @type {Set}
 * @private
 * @const
 */
const SETTINGS_API_PROPERTIES = new Set(Object.keys(config.get('account.settings')).filter(key => !config.get('_account_readonly_settings').includes(key)));


/**
 * Set of keys defining properties required by the object before it can be saved in the database as described in {@link module:core/models/BaseModel/BaseModel.constructor}.
 * @type {Set}
 * @private
 * @const
 */
const SETTINGS_REQUIRED_PROPERTIES = new Set([]);


/**
 * Set of keys defining properties hidden from stringification as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Set}
 * @private
 * @const
 */
const SETTINGS_HIDDEN_PROPERTIES = new Set([ 'created', 'updated', ...config.get('_account_hidden_settings'), ]);


/**
 * Set of keys defining read-only properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}.
 * This properties can be read via the public interface but set only via object's private interface.
 * @type {Set}
 * @private
 * @const
 */
const SETTINGS_READONLY_PROPERTIES = new Set(config.get('_account_readonly_settings'));


/**
 * Structure defining validators for Settings's properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {object}
 * @private
 */
const _settings_properties_validators = {
    default_payment_currency: (currency) => {
        if (currency && !config.get('system.supported_payment_currencies').includes(currency)) {
            throw new Error('Unsupported payment currency');
        }
    },
    default_payment_timeout: (timeout) => {
        if (timeout !== undefined && !checks.isInteger(timeout)) { throw new Error('Invalid format'); }
    },
    provide_receipt_via_email: (bool) => {
        if (bool !== undefined && typeof bool !== typeof true) { throw new Error('Invalid format'); }
    },
    provide_refund_via_email: (bool) => {
        if (bool !== undefined && typeof bool !== typeof true) { throw new Error('Invalid format'); }
    },
    home_issuer: (domain) => {
        if (domain && !checks.isDomain(domain)) { throw new Error('Invalid domain format'); }
    },
    acceptable_issuers: (issuers) => {
        if (!Array.isArray(issuers)) { throw new Error('Invalid format'); }

        if (!issuers.every((issuer) => { return checks.isDomain(helpers.extractIssuer(issuer)); })) {
            throw new Error('Invalid format');
        }
    },
    return_url: (url) => {
        if (url && !checks.isURL(url)) { throw new Error('Invalid format'); }
    },
    callback_url: (url) => {
        if (url && !checks.isURL(url)) { throw new Error('Invalid format'); }
    },
    provide_issuer_refund_via_email: (bool) => {
        if (bool !== undefined && typeof bool !== typeof true) { throw new Error('Invalid format'); }
    },
};

// We are sealing the structure to prevent any modifications
BaseModel.lockPropertiesOf(_settings_properties_validators);


/**
 * Structure defining custom getters for Settings's properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {object}
 * @private
 */
const _settings_properties_custom_getters = {
    acceptable_issuers: (issuers) => {
        let acceptable_issuers = config.get('account.settings.home_issuer') ?
                [ `(${config.get('account.settings.home_issuer')})`, ] :
                undefined;

        if (!acceptable_issuers) { throw new Error('Can not determine value of acceptable_issuers'); }
        return acceptable_issuers;
    },
};

// All settings if not explicitly defined by the Merchant should have their default values taken from the Gateway's
// configuration
for (let property of SETTINGS_ALLOWED_PROPERTIES) {
    if (!_settings_properties_custom_getters.hasOwnProperty(property)) {
        _settings_properties_custom_getters[property] = function () {
            if (this[_settings_data][property]) {
                return this[_settings_data][property];
            }
            else {
                return config.get(`account.settings.${property}`);
            }
        };
    }
}

// We are sealing the structure to prevent any modifications
BaseModel.lockPropertiesOf(_settings_properties_custom_getters);

/**
 * Structure defining custom setters for Settings's properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {object}
 * @private
 */
const _settings_properties_custom_setters = {};
BaseModel.lockPropertiesOf(_settings_properties_custom_setters);


/**
 * Class representing the [Merchant's account configuration]{@link module:core/models/Account}. It defines all available
 * options to be set or read from the account. The Gateway operator has the opportunity to influence many aspects of the
 * account's default configuration via the [The Gateway's configuration]{@link Config}.
 * Objects of this class are not stored in the database as separate records but instead bind with a corresponding
 * account object and saved as its sub-document.
 * @type {PaymentConfirmation}
 * @extends BaseModel
 */
exports.Settings = class Settings extends BaseModel {
    /**
     * Constructor accepts initial properties' values and initialises BaseModel mechanisms by calling the super
     * constructor and passing locally-defined structures as described in {@link module:core/models/BaseModel/BaseModel.constructor}
     * @param init_data
     */
    constructor (init_data = {}) {
        super ({
            private_data_container_key: _settings_data,
            private_interface_key: _settings_interface,
            db_session_id: _db_session,
            custom_getters: _settings_properties_custom_getters,
            custom_setters: _settings_properties_custom_setters,
            validators: _settings_properties_validators,
            allowed_properties: SETTINGS_ALLOWED_PROPERTIES,
            api_properties: SETTINGS_API_PROPERTIES,
            required_properties: SETTINGS_REQUIRED_PROPERTIES,
            hidden_properties: SETTINGS_HIDDEN_PROPERTIES,
            readonly_properties: SETTINGS_READONLY_PROPERTIES,
            db_table: undefined,
            db_id_field: undefined,
        });

        // As default settings' values are taken from the Gateway configuration we need to set only explicitly defined
        // keys
        for (let setting of Object.keys(init_data)) {
            if (!SETTINGS_READONLY_PROPERTIES.has(setting)) {
                this[setting] = init_data[setting];
            }
        }
    }


    /**
     * Properties' names that can be set via API. This structure is used by the static method [checkAPIProperties]{@link module:core/models/BaseModel/BaseModel#checkAPIProperties}
     * to validate if passed structure has only allowed properties and can be feed to constructor.
     * @returns {Set<String>}
     * @static
     */
    static get API_PROPERTIES () { return SETTINGS_API_PROPERTIES; }


    /**
     * A public interface to access class specific validators. This is needed if a different class will have the same
     * property, to reuse its validator, instead of reimplementing it.
     * @returns {Object}
     * @static
     */
    static get VALIDATORS () { return _settings_properties_validators; }


    /**
     * Returns names of properties that have explicitly defined values.
     * @returns {Set<String>}
     */
    get customizedSettings () {
        return new Set(Object.keys(this[_settings_data]));
    }


    /**
     * Returns names of properties that are locked and can't be modified.
     * @returns {Set<String>}
     */
    get lockedSettings () {
        return SETTINGS_READONLY_PROPERTIES;
    }

    /**
     * Overrides the BaseModel'a toJSON in order to add _locked_settings key to the returned dataset.
     * @returns {Object}
     */
    toJSON () {
        let data = super.toJSON();
        let locked_settings = Array.from(this.lockedSettings.values());

        if (locked_settings && locked_settings.length) {
            data._locked_settings = locked_settings;
        }
        else {
            data._locked_settings = [];
        }

        return data;
    }
};


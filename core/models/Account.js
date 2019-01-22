"use strict";

/**
 * This module defines the Account class that represents the Merchant's account in the Gateway environment.
 * It implements {@link module:core/models/BaseModel/BaseModel} interface, together with all corresponding structures
 * as described in {@link module:core/models/BaseModel/BaseModel.construtor}
 * @module core/models/Account
 * @link module:core/models/BaseModel
 */

const config = require('config');
const crypto = require('crypto');

const db = require(config.get('system.root_dir') + '/db');
const checks = require(config.get('system.root_dir') + '/core/checks');

const { BaseModel } = require(config.get('system.root_dir') + '/core/models/BaseModel');
const { Settings } = require(config.get('system.root_dir') + '/core/models/Settings');
const { PaymentConfirmation } = require(config.get('system.root_dir') + '/core/models/PaymentConfirmation');

/**
 * Symbol to be used to conceal private data container inside the Account object as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Symbol}
 * @private
 * @const
 */
const _account_data = Symbol('_account_data');


/**
 * Symbol to be used to conceal private interface container inside the Account object as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Symbol}
 * @private
 * @const
 */
const _account_interface = Symbol('_account_interface');


/**
 * Symbol to be used to store database session id inside the Account object as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {Symbol}
 * @private
 * @const
 */
const _db_session = Symbol('_db_session');


/**
 * A separator to be used to separate public and private parts of the admin authentication token.
 * @type {string}
 * @private
 * @const
 */
const AUTH_TOKEN_KEY_SEPARATOR = '.';


/**
 * Set of keys defining properties available via the object's public interface as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * We are combining one-time or conditional keys like private_key with properties defined on the config level to ensure
 * a common interface to all of them but preventing some of them to be defined on the Gateway level.
 * @type {Set}
 * @private
 * @const
 */
const ACCOUNT_ALLOWED_PROPERTIES = new Set([ 'account_id', 'auth_token', 'private_key', 'admin_auth_token', 'updated', 'created', ...Object.keys(config.get('account')), ]);


/**
 * Set of keys defining properties required by the object before it can be saved in the database as described in {@link module:core/models/BaseModel/BaseModel.constructor}.
 * In this case required keys are the same as defined in the Gateway configuration {@link Config/_register_required_keys}
 * @type {Set}
 * @private
 * @const
 */
const ACCOUNT_REQUIRED_PROPERTIES = new Set(config.get('_register_required_keys'));


/**
 * Set of keys defining properties hidden from stringification as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * We don't want to expose internal account_id to the Merchant as it's being used for internal operations only.
 * The Merchant should use authentication token to identify its account.
 * @type {Set}
 * @private
 * @const
 */
const ACCOUNT_HIDDEN_PROPERTIES = new Set([ 'account_id', 'updated', 'created', ]);


/**
 * Set of keys defining read-only properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}.
 * This properties can be read via the public interface but set only via object's private interface.
 * @type {Set}
 * @private
 * @const
 */
const ACCOUNT_READONLY_PROPERTIES = new Set([ 'account_id', 'auth_token', 'updated', 'created', 'admin_auth_token', 'private_key', ]);


/**
 * Structure defining validators for Account's properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {object}
 * @private
 */
const _account_properties_validators = {
    domain: (domain) => { if (domain && !checks.isDomain(domain)) { throw new Error('Invalid domain format'); }},
    email_account_contact: (email_account_contact) => { if (email_account_contact && !checks.isEmail(email_account_contact)) { throw new Error('Invalid email_account_contact format'); }},
    email_customer_contact: (email_customer_contact) => { if (email_customer_contact && !checks.isEmail(email_customer_contact)) { throw new Error('Invalid email_customer_contact format'); }},
    name: (name) => { if (name && (name.length < 1 || name.length > 128)) { throw new Error('Invalid name format'); }},
    settings: (settings) => { if (!(settings instanceof Settings)) { throw new Error('Must be instance of Settings'); }},
};

// We are sealing the structure to prevent any modifications
BaseModel.lockPropertiesOf(_account_properties_validators);


/**
 * Structure defining custom getter for Account's properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {object}
 * @private
 */
const _account_properties_custom_getters = {
    account_id: function () {
        return this[_account_data]._id;
    },
};

// We are sealing the structure to prevent any modifications
BaseModel.lockPropertiesOf(_account_properties_custom_getters);


/**
 * Structure defining custom setters for Account's properties as described in {@link module:core/models/BaseModel/BaseModel.constructor}
 * @type {object}
 * @private
 */
const _account_properties_custom_setters = {};

// We are sealing the structure to prevent any modifications
BaseModel.lockPropertiesOf(_account_properties_custom_setters);


/**
 * Class representing the Merchant's account in the Gateway ecosystem. It implements BaseModel interface using its
 * mechanisms to keep its properties under control and gain access to the database.
 * This class, apart from standard properties, also contains "settings" property which holds an object of type
 * [Settings]{@link module:core/models/Settings} being a container for the account's configuration.
 * @type {Account}
 * @extends BaseModel
 */
exports.Account = class Account extends BaseModel {
    /**
     * Constructor accepts initial properties' values and initialises BaseModel mechanisms by calling the super
     * constructor and passing locally-defined structures as described in {@link module:core/models/BaseModel/BaseModel.constructor}
     * @param init_data
     */
    constructor (init_data={}) {
        super({
            private_data_container_key: _account_data,
            private_interface_key: _account_interface,
            db_session_id: _db_session,
            custom_getters: _account_properties_custom_getters,
            custom_setters: _account_properties_custom_setters,
            validators: _account_properties_validators,
            allowed_properties: ACCOUNT_ALLOWED_PROPERTIES,
            required_properties: ACCOUNT_REQUIRED_PROPERTIES,
            hidden_properties: ACCOUNT_HIDDEN_PROPERTIES,
            readonly_properties: ACCOUNT_READONLY_PROPERTIES,
            db_table: 'accounts',
            db_id_field: '_id',
            db_id_value: 'account_id',
        });

        this[_account_data] = {
            settings: new Settings(),
        };

        for (let property of config.get('_register_allowed_keys')) {
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
    static get VALIDATORS () { return _account_properties_validators; }


    /**
     * Static method that allows to retrieve an account from a database that is identified by the provide account
     * identifier. It is using object's private interface to initialise the object without firing its validators and
     * setters.
     * @param {string} account_identifier - either account's id or auth_token
     * @returns {Promise<Account>}
     * @async
     * @static
     */
    static async find(account_identifier) {
        try {
            if (!account_identifier) { throw new Error("Missing account's identifier"); }

            let prepared_account = new Account(), private_key = undefined;

            // There is a chance that the Merchant passed his admin auth token, instead of a standard one. In that case
            // we need to extract the standard auth token part
            [account_identifier, private_key, ] = account_identifier.split(AUTH_TOKEN_KEY_SEPARATOR);

            prepared_account[_account_data] = await db.findOne('accounts', { $or: [ { _id: account_identifier }, { auth_token: account_identifier }, ] });

            // Make sure that settings property is of type Settings
            prepared_account[_account_data].settings = new Settings(prepared_account[_account_data].settings);

            // Make sure that confirmation_details property is of type PaymentConfirmation
            if (prepared_account[_account_data].confirmation_details) {
                prepared_account[_account_data].confirmation_details = new PaymentConfirmation(prepared_account[_account_data].confirmation_details);
            }

            // If admin auth token was provided we can fill both private_key property and admin_auth_token
            prepared_account[_account_data].private_key = private_key;

            if (private_key) {
                prepared_account[_account_data].admin_auth_token = `${account_identifier}${AUTH_TOKEN_KEY_SEPARATOR}${private_key}`;
            }

            return prepared_account;
        }
        catch (e) {
            console.log('Account find', e);
            throw Error('Unable to find the account with given identifier');
        }
    }


    /**
     * Creates a new Account in the database.
     * It uses [BaseModel's create method]{@link module:core/models/BaseModel/BaseModel.create} to insert the object's
     * representation into the database. It also defines an initial set of configuration for the account and generates
     * authentication keys together with a private key used for Coins encryption.
     * @returns {Promise<Account>}
     * @async
     */
    async create() {
        // Generate account's auth token
        const diffHell = crypto.createECDH('secp256k1');
        diffHell.generateKeys();

        // Save generated public key as an auth token - this will be saved in the database and used for the account's
        // authentication
        this[_account_data].auth_token = diffHell.getPublicKey('hex', 'compressed');

        // Set required initial settings - this settings won't change its value even if the Gateway operator decides to
        // change the Gateway configuration
        this.settings.home_issuer = config.get('account.settings.home_issuer');
        this.settings.acceptable_issuers = config.get('account.settings.acceptable_issuers');
        this.settings.default_payment_timeout = config.get('account.settings.default_payment_timeout');
        this.settings.default_payment_currency = config.get('account.settings.default_payment_currency');

        // TODO: to consider - allow to set other options like refund etc. during registration
        if (this.email_customer_contact) {
            this.settings.provide_receipt_via_email = config.get('account.settings.provide_receipt_via_email');
            this.settings.provide_refund_via_email = config.get('account.settings.provide_refund_via_email');
        }

        await super.create();

        console.log('register account', this);

        // After the account is stored in the database fill the private_key and admin_auth_token. These fields should
        // never be stored in the database, that is why we are filling them after object's creation. We will return them
        // to the Merchant in the response from the accounts creation but it will impossible to restore them later.
        this[_account_data].admin_auth_token = `${this[_account_data].auth_token}${AUTH_TOKEN_KEY_SEPARATOR}${this[_account_data].private_key}`;
        this[_account_data].private_key = diffHell.getPrivateKey('hex');

        return this;
    }


    /**
     * Method to save the account's settings only.
     * As the account's settings are not stored as a separate object but rather as a sub-document of the Account's
     * document in the database we need to have a way to save them as we can't use build-in save method.
     * @returns {Promise<Account>}
     * @async
     */
    async saveSettings () {
        try {
            this[_account_data] = await db.findAndModify(this[_account_interface].db_table,
                { _id: this.account_id, },
                { settings: this[_account_data].settings, },
                { db_session: this[_account_interface].db_session_id, }
            );

            return this;
        }
        catch (e) {
            console.log('account saveSettings', e);

            throw new Error("Unable to save account's settings");
        }
    }
};

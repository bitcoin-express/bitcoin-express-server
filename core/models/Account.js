"use strict";

const config = require('config');
const crypto = require('crypto');

const db = require(config.get('system.root_dir') + '/db');
const checks = require(config.get('system.root_dir') + '/core/checks');

const { BaseModel } = require(config.get('system.root_dir') + '/core/models/BaseModel');
const { Settings } = require(config.get('system.root_dir') + '/core/models/Settings');
const { PaymentConfirmation } = require(config.get('system.root_dir') + '/core/models/PaymentConfirmation');

// Container identifier for private properties
const _account_data = Symbol('_account_data');
const _account_interface = Symbol('_account_interface');
const _db_session = Symbol('_db_session');


const ACCOUNT_ALLOWED_PROPERTIES = new Set([ 'account_id', 'auth_token', ...Object.keys(config.get('account')), ]);
const ACCOUNT_REQUIRED_PROPERTIES = new Set(config.get('_register_required_keys'));
const ACCOUNT_HIDDEN_PROPERTIES = new Set([ 'account_id', ]);
const ACCOUNT_READONLY_PROPERTIES = new Set([ 'auth_token', ]);

const _account_properties_validators = {
    domain: (domain) => { if (domain && !checks.isDomain(domain)) { throw new Error('Invalid domain format'); }},
    email_account_contact: (email_account_contact) => { if (email_account_contact && !checks.isEmail(email_account_contact)) { throw new Error('Invalid email_account_contact format'); }},
    email_customer_contact: (email_customer_contact) => { if (email_customer_contact && !checks.isEmail(email_customer_contact)) { throw new Error('Invalid email_customer_contact format'); }},
    name: (name) => { if (name && (name.length < 1 || name.length > 128)) { throw new Error('Invalid name format'); }},
    settings: (settings) => { if (!(settings instanceof Settings)) { throw new Error('Must be instance of Settings'); }},
};
BaseModel.lockPropertiesOf(_account_properties_validators);

const _account_properties_custom_getters = {
    account_id: function () {
        return this[_account_data]._id;
    },
};
BaseModel.lockPropertiesOf(_account_properties_custom_getters);

const _account_properties_custom_setters = {};
BaseModel.lockPropertiesOf(_account_properties_custom_setters);

exports.Account = class Account extends BaseModel {
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
            db_table: undefined,
            db_id_field: undefined,
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

    /*      Static methods      */
    static get VALIDATORS () { return _account_properties_validators; }

    static async find(account_identifier) {
        try {
            if (!account_identifier) { throw new Error("Missing account's identifier"); }

            let prepared_account = new Account();
            prepared_account[_account_data] = await db.findOne('accounts', { $or: [ { _id: account_identifier }, { auth_token: account_identifier }, ] });
            prepared_account[_account_data].settings = new Settings(prepared_account[_account_data].settings);

            if (prepared_account[_account_data].confirmation_details) {
                prepared_account[_account_data].confirmation_details = new PaymentConfirmation(prepared_account[_account_data].confirmation_details);
            }

            return prepared_account;
        }
        catch (e) {
            console.log('Account find', e);
            throw Error('Unable to find the account with given identifier');
        }
    }

    /*      Methods     */

    // Create new account using data provided in a constructor
    async create() {
        // Generate account's auth token
        // TODO: make sense to it
        const diffHell = crypto.createDiffieHellman(60);
        diffHell.generateKeys();

        // TODO: to be removed after testing phase
        this[_account_data].private_key = diffHell.getPrivateKey('hex');

        // Set required initial settings
        this[_account_data].auth_token = diffHell.getPublicKey('hex');
        this.settings.home_issuer = config.get('account.settings.home_issuer');
        this.settings.acceptable_issuers = config.get('account.settings.acceptable_issuers');
        this.settings.default_payment_timeout = config.get('account.settings.default_payment_timeout');
        this.settings.default_payment_currency = config.get('account.settings.default_payment_currency');

        // TODO: to consider - allow to set other options like refund etc. during registration
        if (this.email_customer_contact) {
            this.settings.provide_receipt_via_email = config.get('account.settings.provide_receipt_via_email');
            this.settings.provide_refund_via_email = config.get('account.settings.provide_refund_via_email');
        }

        console.log('register account', this);

        try {
            await db.insert("accounts", this[_account_data]);
            return this;
        }
        catch (e) {
            throw e;
        }
    }

    async saveSettings () {
        try {
            this[_account_data] = await db.findAndModify('accounts',
                {
                    _id: this.account_id,
                },
                {
                    settings: this[_account_data].settings,
                }
            );

            return this;
        }
        catch (e) {
            console.log('account saveSettings', e);

            throw new Error("Unable to save account's settings");
        }
    }
};

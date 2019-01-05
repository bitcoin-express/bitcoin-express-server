"use strict";

const config = require('config');
const crypto = require('crypto');

const db = require(config.get('system.root_dir') + '/db');
const checks = require(config.get('system.root_dir') + '/core/checks');

const { Settings } = require(config.get('system.root_dir') + '/core/models/Settings');

// Container identifier for private properties
const _account = Symbol('account');

const _account_properties_validators = {
    domain: (domain) => { if (domain && !checks.isDomain(domain)) { throw new Error('Invalid domain format'); }},
    email_account_contact: (email_account_contact) => { if (email_account_contact && !checks.isEmail(email_account_contact)) { throw new Error('Invalid email_account_contact format'); }},
    email_customer_contact: (email_customer_contact) => { if (email_customer_contact && !checks.isEmail(email_customer_contact)) { throw new Error('Invalid email_customer_contact format'); }},
    name: (name) => { if (name && (name.length < 1 || name.length > 128)) { throw new Error('Invalid name format'); }},
    settings: (settings) => { if (!(settings instanceof Settings)) { throw new Error('Must be instance of Settings'); }},
};

exports.Account = class Account {
    static get ALLOWED_PROPERTIES () {
        let allowed_properties = [
            'auth_token',
            // 'account_id',
        ];
        allowed_properties.push(...Object.keys(config.get('account')));

        return allowed_properties;
    }

    constructor (args={}) {
        // Create container for private object's data. This can't be done later as we are sealing object at the end.
        this[_account] = {
            settings: new Settings(),
        };

        // Make this container invisible for any methods working on properties
        Object.defineProperty(this, _account, {
            enumerable: false,
        });

        // Create getters and setters for all allowed properties. We are doing this using defineProperty and not get/set
        // in order to make them enumerable.
        for (let property of Account.ALLOWED_PROPERTIES) {
            let descriptor = {
                configurable: false,
                enumerable: true,
                get: () => { return this[_account][property]; },
            };

            // If there is no validator for a property then this property is readonly.
            // Only validated options are allowed to be set.
            if (_account_properties_validators.hasOwnProperty(property)) {
                descriptor.set = (value) => {
                    _account_properties_validators[property](value);
                    this[_account][property] = value;
                };
            }
            else {
                descriptor.set = (value) => {
                    throw new Error(`Key ${property} is readonly`);
                };
            }

            Object.defineProperty(this, property, descriptor);
        }

        Object.defineProperty(this, 'account_id', {
            configurable: false,
            enumerable: false,
            get: () => { return this[_account]._id; },
        });

        // Set initial values from constructor's arguments
        for (let property of config.get('_register_allowed_keys')) {
            if (args.hasOwnProperty(property)) {
                this[property] = args[property];
            }
        }

        Object.seal(this);
    }

    /*      Properties      */

    /* All properties are set dynamically in a constructor */

    /*      Static methods      */

    static async find(account_identifier) {
        try {
            if (!account_identifier) { throw new Error("Missing account's identifier"); }

            let prepared_account = new Account();
            prepared_account[_account] = await db.findOne('accounts', { $or: [ { _id: account_identifier }, { auth_token: account_identifier }, ] });
            prepared_account[_account].settings = new Settings(prepared_account[_account].settings);
            return prepared_account;
        }
        catch (e) {
            console.log('Account find', e);
            throw Error('Unable to find the account with given identifier');
        }
    }

    /*      Methods     */

    // Create new account using data provided in a constructor
    async register() {
        // Generate account's auth token
        // TODO: make sense to it
        const diffHell = crypto.createDiffieHellman(60);
        diffHell.generateKeys();

        // TODO: to be removed after testing phase
        this[_account].private_key = diffHell.getPrivateKey('hex');

        // Set required initial settings
        this[_account].auth_token = diffHell.getPublicKey('hex');
        this[_account].settings.home_issuer = config.get('account.settings.home_issuer');
        this[_account].settings.acceptable_issuers = config.get('account.settings.acceptable_issuers');
        this[_account].settings.default_payment_timeout = config.get('account.settings.default_payment_timeout');
        this[_account].settings.default_payment_currency = config.get('account.settings.default_payment_currency');

        // TODO: to consider - allow to set other options like refund etc. during registration
        if (this.email_customer_contact) {
            this[_account].settings.provide_receipt_via_email = config.get('account.settings.provide_receipt_via_email');
            this[_account].settings.provide_refund_via_email = config.get('account.settings.provide_refund_via_email');
        }

        console.log('register account', this);

        try {
            let account = await db.insert("accounts", this[_account]);
            return this;
        }
        catch (e) {
            throw e;
        }
    }

    async saveSettings () {
        try {
            this[_account] = await db.findAndModify('accounts',
                {
                    _id: this.account_id,
                },
                {
                    settings: this[_account].settings,
                }
            );

            return this;
        }
        catch (e) {
            console.log('account saveSettings', e);

            throw new Error("Unable to save account's settings");
        }
    }

    toJSON () {
        let json_data = {};

        for (let property of Object.keys(this)) {
            if (this[property] !== undefined) {
                json_data[property] = this[property];
            }
        }

        return json_data;
    }
};

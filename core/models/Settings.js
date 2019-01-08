"use strict";

const config = require('config');
const db = require(config.get('system.root_dir') + '/db');
const checks = require(config.get('system.root_dir') + '/core/checks');

const _settings = Symbol('_settings');
const _settings_properties_validators = {
    default_payment_currency: (currency) => {
        if (currency && !config.get('system.supported_payment_currencies').includes(currency)) {
            throw new Error('Unsupported payment currency');
        }
    },
    default_payment_timeout: (timeout) => {
        if (timeout !== undefined && !checks.isInteger(timeout)) {
            throw new Error('Invalid format');
        }
    },
    provide_receipt_via_email: (bool) => {
        if (bool !== undefined && typeof bool !== typeof true) {
            throw new Error('Invalid format');
        }
    },
    provide_refund_via_email: (bool) => {
        if (bool !== undefined && typeof bool !== typeof true) {
            throw new Error('Invalid format');
        }
    },
    home_issuer: (domain) => {
        if (domain && !checks.isDomain(domain)) {
            throw new Error('Invalid domain format');
        }
    },
    // TODO: add issuer with *
    acceptable_issuers: (issuers) => {
        if (!Array.isArray(issuers)) {
            throw new Error('Invalid format');
        }

        let trusted_issuer_regex = /^\((\S+)\)$/i;
        if (!issuers.every((issuer) => {
            let issuer_domain = trusted_issuer_regex.exec(issuer);
            issuer = Array.isArray(issuer_domain) ? issuer_domain[1] : issuer;

            return checks.isDomain(issuer);

        })) {
            throw new Error('Invalid format');
        }
    },
    return_url: (url) => {
        if (url && !checks.isURL(url)) {
            throw new Error('Invalid format');
        }
    },
    callback_url: (url) => {
        if (url && !checks.isURL(url)) {
            throw new Error('Invalid format');
        }
    },
};
exports.validators = _settings_properties_validators;

const _settings_properties_custom_getters = {
    acceptable_issuers: (issuers) => {
        let configured_acceptable_issuers = config.get('account.settings.acceptable_issuers');
        let acceptable_issuers = configured_acceptable_issuers && Array.isArray(configured_acceptable_issuers) && configured_acceptable_issuers.length > 0 ?
               configured_acceptable_issuers :
               config.get('account.settings.home_issuer') ?
                [ `(${config.get('account.settings.acceptable_issuers')})`, ] :
                undefined;

        if (!acceptable_issuers) { throw new Error('Can not determine value of acceptable_issuers'); }
        return acceptable_issuers;
    },
};

exports.Settings = class Settings {
    static get ALLOWED_PROPERTIES () {
        return Object.keys(config.get('account.settings'));
    }

    constructor (args = {}) {
        // Create container for private object's data. This can't be done later as we are sealing object at the end.
        this[_settings] = {};

        // Make this container invisible for any methods working on properties
        Object.defineProperty(this, _settings, {
            enumerable: false,
        });

        for (let setting of Settings.ALLOWED_PROPERTIES) {
            let descriptor = {
                configurable: false,
                enumerable: true,
                get: () => { return this[_settings][setting] !== undefined ?
                                    this[_settings][setting] :
                                    _settings_properties_custom_getters.hasOwnProperty(setting) ?
                                        _settings_properties_custom_getters[setting]() :
                                        config.get(`account.settings.${setting}`);
                },
            };

            if (!config.get('_account_readonly_settings').includes(setting)) {
                descriptor.set = (value) => {
                    if (_settings_properties_validators.hasOwnProperty(setting)) {
                        _settings_properties_validators[setting](value);
                    }

                    this[_settings][setting] = value;
                };
            }
            else {
                descriptor.set = (value) => {
                    throw new Error(`Key ${setting} is readonly`);
                };
            }

            Object.defineProperty(this, setting, descriptor);
        }

        Object.seal(this);

        for (let setting of Object.keys(args)) {
            this[setting] = args[setting];
        }
    }

    getSetKeys () {
        return Object.keys(this[_settings]);
    }

    getCustomisedSettings() {
        return Object.assign({}, this[_settings]);
    }

    clone () {
        let cloned_object = new Settings();
        Object.assign(cloned_object[_settings], this[_settings]);

        return cloned_object;
    }

    toJSON () {
        let visible_settings = {};

        for (let setting of Settings.ALLOWED_PROPERTIES) {
            if (config.get('_account_hidden_settings').includes(setting)) { continue; }
            visible_settings[setting] = this[setting];
        }

        return visible_settings;
    }

};


"use strict";

const config = require('config');
const db = require(config.get('system.root_dir') + '/db');
const checks = require(config.get('system.root_dir') + '/core/checks');

const { BaseModel } = require(config.get('system.root_dir') + '/core/models/BaseModel');

const _settings_data = Symbol('_settings_data');
const _settings_interface = Symbol('_settings_interface');
const _db_session = Symbol('_db_session');

const SETTINGS_ALLOWED_PROPERTIES = new Set(Object.keys(config.get('account.settings')));
const SETTINGS_REQUIRED_PROPERTIES = new Set([]);
const SETTINGS_HIDDEN_PROPERTIES = new Set(config.get('_account_hidden_settings'));
const SETTINGS_READONLY_PROPERTIES = new Set(config.get('_account_readonly_settings'));

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
BaseModel.lockPropertiesOf(_settings_properties_validators);


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

for (let property of SETTINGS_ALLOWED_PROPERTIES) {
    if (!_settings_properties_custom_getters.hasOwnProperty(property)) {
        _settings_properties_custom_getters[property] = function () {
            return config.get(`account.settings.${property}`);
        };
    }
}

BaseModel.lockPropertiesOf(_settings_properties_custom_getters);


const _settings_properties_custom_setters = {};
BaseModel.lockPropertiesOf(_settings_properties_custom_setters);


exports.Settings = class Settings extends BaseModel {
    constructor (init_data = {}) {
        super ({
            private_data_container_key: _settings_data,
            private_interface_key: _settings_interface,
            db_session_id: _db_session,
            custom_getters: _settings_properties_custom_getters,
            custom_setters: _settings_properties_custom_setters,
            validators: _settings_properties_validators,
            allowed_properties: SETTINGS_ALLOWED_PROPERTIES,
            required_properties: SETTINGS_REQUIRED_PROPERTIES,
            hidden_properties: SETTINGS_HIDDEN_PROPERTIES,
            readonly_properties: SETTINGS_READONLY_PROPERTIES,
            db_table: undefined,
            db_id_field: undefined,
        });

        for (let setting of Object.keys(init_data)) {
            this[setting] = init_data[setting];
        }
    }

    static get VALIDATORS () { return _settings_properties_validators; }

    get customizedSettings () {
        return Object.keys(this[_settings_data]);
    }
};


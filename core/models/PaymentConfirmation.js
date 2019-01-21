"use strict";
const config = require('config');
const checks = require(config.get('system.root_dir') + '/core/checks');

const { BaseModel } = require(config.get('system.root_dir') + '/core/models/BaseModel');

const _confirmation_data = Symbol('_confirmation_data');
const _confirmation_interface = Symbol('_confirmation_interface');
const _db_session = Symbol('_db_session');

const PAYMENT_CONFIRMATION_ALLOWED_PROPERTIES = new Set ([ 'coins', 'wallet_id', 'client_type', 'options', 'memo', 'created', 'updated', ]);
const PAYMENT_CONFIRMATION_REQUIRED_PROPERTIES = new Set([ 'coins', ]);
const PAYMENT_CONFIRMATION_HIDDEN_PROPERTIES = new Set([ 'created', 'updated', ]);
const PAYMENT_CONFIRMATION_READONLY_PROPERTIES = new Set([ 'created', 'updated', ]);


const PAYMENT_CONFIRMATION_CLIENT_TYPES = new Set ([ 'web', 'app', ]);

const _confirmation_properties_validators = {
    coins: coins => {
        console.log(coins, typeof coins);
        if (!coins) {
            throw new Error ('Field required');
        }

        if (!Array.isArray(coins)) {
            throw new Error ('Invalid format');
        }

        if (coins.length < 1) {
            throw new Error ('Invalid format');
        }

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
    client_type: client_type => {
        if (!PAYMENT_CONFIRMATION_CLIENT_TYPES.has(client_type)) {
            throw new Error ('Invalid value');
        }
    },
    options: options => {
        if (!options) {
            return true;
        }

        if (typeof options !== "object") {
            throw new Error('Invalid format');
        }

        if (!Object.keys(options).every((option) => [ 'language_preference', 'send_receipt_to', 'send_refund_to' ].includes(option))) {
            throw new Error ('Invalid key');
        }

        if (options.language_preference && language.preference > 10) {
            throw new Error ('Invalid format');
        }

        if (options.send_receipt_to) {
            if (typeof send_receipt_to !== "object") {
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
            if (typeof send_refund_to !== "object") {
                throw new Error('Invalid format');
            }

            if (!Object.keys(options.send_receipt_to).every((option) => [ 'email', 'password', 'reference', ].includes(option))) {
                throw new Error ('Invalid key');
            }

            if (!options.send_receipt_to.email || !checks.isEmail(options.send_receipt_to.email)) {
                throw new Error ('Invalid format');
            }

            if (options.send_receipt_to.password && (typeof options.send_receipt_to.password !== "string" || options.send_receipt_to.password.length < 8 || options.send_receipt_to.password.length > 64)) {
                throw new Error ('Invalid format');
            }

            if (options.send_receipt_to.reference && (typeof options.send_receipt_to.reference !== "string" || options.send_receipt_to.reference.length < 8 || options.send_receipt_to.reference.length > 64)) {
                throw new Error ('Invalid format');
            }
        }
    },
    memo: memo => {
        if (typeof memo !== "string" || memo.length < 1 || memo.length > 256) {
            throw new Error ('Invalid format');
        }
    },
};
BaseModel.lockPropertiesOf(_confirmation_properties_validators);

const _confirmation_properties_custom_getters = {};
BaseModel.lockPropertiesOf(_confirmation_properties_custom_getters);

const _confirmation_properties_custom_setters = {};
BaseModel.lockPropertiesOf(_confirmation_properties_custom_setters);

exports.PaymentConfirmation = class PaymentConfirmation extends BaseModel {
    constructor (init_data={}) {
        super ({
            private_data_container_key: _confirmation_data,
            private_interface_key: _confirmation_interface,
            db_session_id: _db_session,
            custom_getters: _confirmation_properties_custom_getters,
            custom_setters: _confirmation_properties_custom_setters,
            validators: _confirmation_properties_validators,
            allowed_properties: PAYMENT_CONFIRMATION_ALLOWED_PROPERTIES,
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

    static get VALIDATORS () { return _confirmation_properties_validators; }
};

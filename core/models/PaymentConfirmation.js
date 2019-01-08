"use strict";
const config = require('config');
const checks = require(config.get('system.root_dir') + '/core/checks');

const _details = Symbol('_details');

const PAYMENT_CONFIRMATION_ALLOWED_PROPERTIES = new Set ([ 'coins', 'wallet_id', 'client_type', 'options', 'memo', ]);
const PAYMENT_CONFIRMATION_CLIENT_TYPES = new Set ([ 'web', 'app', ]);

const _confirmation_properties_validators = {
    coins: coins => {
        console.log(coins, typeof coins);
        if (!coins) {console.log('111');
            throw new Error ('Field required');
        }

        if (!Array.isArray(coins)) {console.log('222');
            throw new Error ('Invalid format');
        }

        if (coins.length < 1) {console.log('333');
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
const _confirmation_properties_custom_getters = {};
const _confirmation_properties_custom_setters = {};

exports.PaymentConfirmation = class PaymentConfirmation {
    static get ALLOWED_PROPERTIES () {
        return PAYMENT_CONFIRMATION_ALLOWED_PROPERTIES;
    }

    constructor (init_data) {
        // Create container for private object's data. This can't be done later as we are sealing object at the end.
        this[_details] = {};

        // Make this container invisible for any methods working on properties
        Object.defineProperty(this, _details, {
            enumerable: false,
        });

        for (let property of PaymentConfirmation.ALLOWED_PROPERTIES) {
            let descriptor = {
                configurable: false,
                enumerable: true,
                get: _confirmation_properties_custom_getters.hasOwnProperty(property) ?
                     _confirmation_properties_custom_getters[property] :
                     () =>  { return this[_details][property]; },
            };

            // If there is no validator for a property then this property is readonly.
            // Only validated options are allowed to be set.
            if (_confirmation_properties_validators.hasOwnProperty(property)) {
                descriptor.set = _confirmation_properties_custom_setters.hasOwnProperty(property) ?
                                 _confirmation_properties_custom_setters[property] :
                                 (value) => {
                                     _confirmation_properties_validators[property](value);
                                     this[_details][property] = value;
                                 };
            }
            else {
                descriptor.set = (value) => {
                    throw new Error(`Key ${property} is readonly`);
                };
            }

            Object.defineProperty(this, property, descriptor);
        }

        Object.seal(this);

        if (init_data) {
            for (let property of PaymentConfirmation.ALLOWED_PROPERTIES) {
                this[property] = init_data[property];
            }
        }
    }
};

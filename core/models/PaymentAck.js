"use strict";

const config = require('config');

const errors = require(config.get('system.root_dir') + '/core/models/Errors');
const { BaseModel } = require(config.get('system.root_dir') + '/core/models/BaseModel');
const { Account } = require(config.get('system.root_dir') + '/core/models/Account');
const { PaymentConfirmation } = require(config.get('system.root_dir') + '/core/models/PaymentConfirmation');
const { Settings } = require(config.get('system.root_dir') + '/core/models/Settings');

const _payment_ack_data = Symbol('_payment_ack_data');
const _payment_ack_interface = Symbol('_payment_ack_interface');
const _db_session = Symbol('_db_session');

const PAYMENT_ACK_STATUS__OK = 'ok';
const PAYMENT_ACK_STATUS__PAYMENT_UNKNOWN = 'payment_unknown';
const PAYMENT_ACK_STATUS__AFTER_EXPIRES = 'after_expires';
const PAYMENT_ACK_STATUS__INSUFFICIENT_AMOUNT = 'insufficient_amount';
const PAYMENT_ACK_STATUS__BAD_COINS = 'bad_coins';
const PAYMENT_ACK_STATUS__RETRY_EXPIRED = 'retry_expired';
const PAYMENT_ACK_STATUS__GENERIC_ERROR = 'generic_error';

const PAYMENT_ACK_STATUSES = new Set([
    PAYMENT_ACK_STATUS__OK,
    PAYMENT_ACK_STATUS__PAYMENT_UNKNOWN,
    PAYMENT_ACK_STATUS__AFTER_EXPIRES,
    PAYMENT_ACK_STATUS__INSUFFICIENT_AMOUNT,
    PAYMENT_ACK_STATUS__BAD_COINS,
    PAYMENT_ACK_STATUS__RETRY_EXPIRED,
    PAYMENT_ACK_STATUS__GENERIC_ERROR,
]);

const PAYMENT_ACK_ALLOWED_PROPERTIES = new Set([ 'status', 'return_url', 'memo', 'seller', 'wallet_id', 'created', 'updated', ]);
const PAYMENT_ACK_REQUIRED_PROPERTIES = new Set([ 'status', 'wallet_id', ]);
const PAYMENT_ACK_READONLY_PROPERTIES = new Set([ 'created', 'updated', ]);
const PAYMENT_ACK_HIDDEN_PROPERTIES = new Set([ 'created', 'updated', ]);

const _payment_ack_properties_validators = {
    status: (status) => {
        if (!PAYMENT_ACK_STATUSES.has(status)) {
            throw new errors.InvalidValueError();
        }
    },
    return_url: Settings.VALIDATORS.return_url,
    memo: BaseModel.VALIDATORS.description,
    seller: Account.VALIDATORS.domain,
    wallet_id: PaymentConfirmation.VALIDATORS.wallet_id,
};
BaseModel.lockPropertiesOf(_payment_ack_properties_validators);

exports.PaymentAck = class PaymentAck extends BaseModel {
    constructor (init_data={}) {
        super ({
            private_data_container_key: _payment_ack_data,
            private_interface_key: _payment_ack_interface,
            db_session_id: _db_session,
            custom_getters: {},
            custom_setters: {},
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

    static get VALIDATORS () { return _payment_ack_properties_validators; }

    static get STATUSES () { return PAYMENT_ACK_STATUSES; }
    static get STATUS__OK () { return PAYMENT_ACK_STATUS__OK; }
    static get STATUS__PAYMENT_UNKNOWN () { return PAYMENT_ACK_STATUS__PAYMENT_UNKNOWN; }
    static get STATUS__AFTER_EXPIRES () { return PAYMENT_ACK_STATUS__AFTER_EXPIRES; }
    static get STATUS__INSUFFICIENT_AMOUNT () { return PAYMENT_ACK_STATUS__INSUFFICIENT_AMOUNT; }
    static get STATUS__BAD_COINS () { return PAYMENT_ACK_STATUS__BAD_COINS; }
    static get STATUS__RETRY_EXPIRED () { return PAYMENT_ACK_STATUS__RETRY_EXPIRED; }
    static get STATUS__GENERIC_ERROR () { return PAYMENT_ACK_STATUS__GENERIC_ERROR; }
};

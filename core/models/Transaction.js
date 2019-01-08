"use strict";
const uuidv4 = require('uuid/v4');

const config = require('config');
const db = require(config.get('system.root_dir') + '/db');
const checks = require(config.get('system.root_dir') + '/core/checks');
const api = require(config.get('system.root_dir') + '/core/api');
const utils = require(config.get('system.root_dir') + '/issuer/utils');
const issuer = require(config.get('system.root_dir') + '/issuer');

const { ObjectId } = require('mongodb');
const { PaymentConfirmation } = require(config.get('system.root_dir') + '/core/models/PaymentConfirmation');

const settings_model = require(config.get('system.root_dir') + '/core/models/Settings');
const account_model = require(config.get('system.root_dir') + '/core/models/Account');
const errors_model = require(config.get('system.root_dir') + '/core/models/Errors');


const TRANSACTION_STATUSES = new Map([
    [ 'initial', 'initial', ],
    [ 'resolved', 'resolved', ],
    [ 'aborted', 'aborted', ],
    [ 'expired', 'expired', ],
    [ 'processing', 'processing', ],
]);

const TRANSACTION_TYPES = new Map([
    [ 'payment', 'payment', ],
    [ 'blockchain-transfer', 'blockchain-transfer', ],
    [ 'coin-file-transfer', 'coin-file-transfer', ],
]);


const _initialise_empty_object = Symbol('_initialise_empty_object');
const _db_session = Symbol('_db_session');
const _transaction = Symbol('_transaction');


const _transaction_properties_validators = {
    order_id: (order_id) => {
        if (order_id !== undefined && (typeof order_id !== "string" || order_id.length < 1 || order_id.length > 64)) {
            throw new Error ('Invalid format');
        }
    },
    expires: (date) => {
        if (!(date instanceof Date)) { throw new Error ('Invalid format'); }
    },
    return_url: settings_model.validators.return_url,
    callback_url: settings_model.validators.callback_url,
    value: (value) => {
        if (!value) {
            throw new Error ('Required field');
        }

        if (!checks.isFloat(value) || value.length < config.get('system.decimal_point_precision') + 2 || value.length > config.get('system.decimal_point_precision') * 2 + 1) {
            throw new Error('Invalid format');
        }
    },
    description: (text) => {
        if (!text) {
            throw new Error ('Required field');
        }

        if (typeof text !== "string" || text.length < 1 || text.length > 64) {
            throw new Error('Invalid format');
        }
    },
    notification: (text) => {
        if (text && (typeof text !== "string" || text.length < 1 || text.length > 128)) {
            throw new Error('Invalid format');
        }
    },
    email_customer_contact: account_model.validators.email_customer_contact,
    acceptable_issuers: settings_model.validators.acceptable_issuers,
    policies: (policies) => {
        if (typeof policies !== "object") {
            throw new Error('Invalid format');
        }

        let allowed_policies = [ 'receipt_via_email', 'refund_via_email', ];
        for (let policy of Object.keys(policies)) {
            if (!allowed_policies.includes(policy)) {
                throw new Error ('Unknown policy');
            }
            else if (typeof policies[policy] !== typeof true) {
                throw new Error ('Invalid format');
            }
        }
    },
    currency: settings_model.validators.default_payment_currency,
    status: status => {
        if (!TRANSACTION_STATUSES.has(status)) { throw new Error('Unknown status'); }
    },
    confirmation_details: details => true,
    verify_details: details => true,
    paid: (date) => {
        if (!(date instanceof Date)) { throw new Error ('Invalid format'); }
    },
};
const _transaction_properties_custom_getters = {
    payment_url: function () {
        return `${config.get('server.api.endpoint_url')}${config.get('server.api.endpoint_path')}${api.routes.get('postTransactionPayment').getPathForId(this.transaction_id)}`
    },
};
const _transaction_properties_custom_setters = {
    return_url: function (value) {
        _transaction_properties_validators['return_url'](value);

        if (value !== undefined) {
            let url = new URL(value);
            url.searchParams.set('transaction_id', this.transaction_id);

            if (this.order_id) {
                url.searchParams.set('order_id', this.order_id);
            }

            value = url.href;
        }

        this[_transaction]['return_url'] = value;
    },

    callback_url: function (value) {
        _transaction_properties_validators['callback_url'](value);

        if (value !== undefined) {
            let url = new URL(value);
            url.searchParams.set('transaction_id', this.transaction_id);

            if (this.order_id) {
                url.searchParams.set('order_id', this.order_id);
            }

            value = url.href;
        }

        this[_transaction]['callback_url'] = value;
    },
};


class CoreTransaction {
    constructor (allowed_properties) {
        // Create container for private object's data. This can't be done later as we are sealing object at the end.
        this[_transaction] = {};

        // Make this container invisible for any methods working on properties
        Object.defineProperty(this, _transaction, {
            enumerable: false,
        });

        Object.defineProperty(this, _db_session, {
            enumerable: false,
            writable: true,
        });

        for (let property of allowed_properties) {
            let descriptor = {
                configurable: false,
                enumerable: true,
                get: _transaction_properties_custom_getters.hasOwnProperty(property) ?
                    _transaction_properties_custom_getters[property] :
                    () =>  { return this[_transaction][property]; },
            };

            // If there is no validator for a property then this property is readonly.
            // Only validated options are allowed to be set.
            if (_transaction_properties_validators.hasOwnProperty(property)) {
                descriptor.set = _transaction_properties_custom_setters.hasOwnProperty(property) ?
                                 _transaction_properties_custom_setters[property] :
                                 (value) => {
                                     _transaction_properties_validators[property](value);
                                     this[_transaction][property] = value;
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
    }

    prepareInputData(input_data) {
        return input_data;
    }

    //TODO: move to interface class
    initDBSession(session) {
        this[_db_session] = session;
    }

    closeDBSession() {
        this[_db_session] = undefined;
    }

    //TODO: move to interface class with throw if not implemented
    async save () {
        try {
            await db.findAndModify('transactions',
                {
                    transaction_id: this.transaction_id,
                },
                {
                    ...this[_transaction],
                },
                {
                    db_session: this[_db_session],
                }
            );

            return this;
        }
        catch (e) {
            console.log('transaction save', e);

            // If transient error, retry the whole transaction
            if (e.errorLabels && e.errorLabels.indexOf('TransientTransactionError') >= 0) {
                console.log('TransientTransactionError, retrying transaction ...');
                await this.save();
            } else {
                throw error;
            }

            throw new Error("Unable to save transaction");
        }
    }
}

const PAYMENT_TRANSACTION_ALLOWED_PROPERTIES = new Set([ 'type', 'order_id', 'value', 'currency', 'description', 'notification', 'return_url', 'callback_url', 'acceptable_issuers',
                                                         'email_customer_contact', 'policies', 'expires', 'transaction_id', 'created', 'seller', 'payment_url', 'status', 'account_id',
                                                         'confirmation_details', 'verify_details', 'paid', ]);
const PAYMENT_TRANSACTION_REQUIRED_PROPERTIES = new Set(['type', 'value', 'currency', 'description', 'acceptable_issuers', 'transaction_id', 'seller', 'payment_url', 'status', 'account_id', ]);

class PaymentTransaction extends CoreTransaction{
    static get ALLOWED_PROPERTIES () {
        return PAYMENT_TRANSACTION_ALLOWED_PROPERTIES;
    }

    static get REQUIRED_PROPERTIES () {
        return PAYMENT_TRANSACTION_REQUIRED_PROPERTIES;
    }


    constructor(init_data) {
        super(PaymentTransaction.ALLOWED_PROPERTIES);

        if (!init_data[_initialise_empty_object]) {

            this[_transaction].type = TRANSACTION_TYPES.get('payment');
            this[_transaction].transaction_id = uuidv4();
            this[_transaction].status = TRANSACTION_STATUSES.get('initial');
            this[_transaction].account_id = init_data.account.account_id;

            this.order_id = init_data.order_id;
            this.value = init_data.value;

            this.return_url = init_data.return_url || init_data.account.settings.return_url || undefined;
            this[_transaction].seller = this.return_url ? new URL(this.return_url).hostname : init_data.account.domain;
            this.callback_url = init_data.callback_url || init_data.account.settings.callback_url || undefined;

            this[_transaction].created = new Date();
            this.expires = init_data.expires ?
                           (
                               init_data.expires instanceof Date ?
                               init_data.expires :
                               new Date(init_data.expires)
                           ) :
                           new Date(this.created.getTime() + init_data.account.settings.default_payment_timeout * 1000);

            this.description = init_data.description;
            this.notification = init_data.notification;
            this.email_customer_contact = init_data.email_customer_contact || init_data.account.email_customer_contact;
            this.acceptable_issuers = init_data.acceptable_issuers || init_data.account.settings.acceptable_issuers;

            this.policies = {
                receipt_via_email: init_data.policies && init_data.policies.hasOwnProperty('receipt_via_email') ?
                                   init_data.policies.receipt_via_email :
                                   init_data.account.settings.provide_receipt_via_email,
                refund_via_email: init_data.policies && init_data.policies.hasOwnProperty('refund_via_email') ?
                                  init_data.policies.refund_via_email :
                                  init_data.account.settings.provide_refund_via_email,
            };

            this.currency = init_data.currency || init_data.account.settings.default_payment_currency;

            if (!this.return_url && !this.notification) {
                throw new Error('Either return_url or notification is required');
            }
        }
/*
        if (merchant_data) {
            var query = {
                account_id: account_id,
                merchant_data: merchant_data,
            };

            promise = db.findOne('transactions', query).then((resp) => {
                if (!resp) {
                    return false;
                }
                console.log("Found payment with merchant_data " + merchant_data);

                delete resp.private_key;
                delete resp.auth_token;
                delete resp.account_id;
                delete resp._id;

                if (resp.status == "resolved") {
                    // The payment is inmutable
                    res.send(JSON.stringify(cleanResponse(resp)));
                    return true;
                }

                if (resp.status == "processing") {
                    res.status(400).send("A payment is already in process for this request.");
                    return true;
                }

                // Reset payment to initial status
                paymentRequest.status = "initial";
                return db.findAndModify('transactions', query, paymentRequest).then((response) => {
                    if (!response) {
                        return false;
                    }
                    res.send(JSON.stringify(cleanResponse(response)));
                    return true;
                });
            }).catch((err) => {
                return false;
            });
        }
*/
    }

    //TODO: move to core with common allowed properties
    toJSON () {
        let data = {};

        for (let property of PaymentTransaction.ALLOWED_PROPERTIES) {
            data[property] = this[property];
        }

        delete data.account_id;

        return data;
    }

    prepareInputData(input_data) {
        if (!(input_data.confirmation_details instanceof PaymentConfirmation)) {
            input_data.confirmation_details = new PaymentConfirmation(input_data.confirmation_details);
        }

        return input_data;
    }

    async create() {
        try {
            let data = {};

            for (let property of PaymentTransaction.ALLOWED_PROPERTIES) {
                data[property] = this[property];
            }

            for (let property of PaymentTransaction.REQUIRED_PROPERTIES) {
                if (this[property] === undefined) {
                    throw new Error (`Transaction property not set: ${property}`);
                }
            }

            await db.insert('transactions', data);
        }
        catch (e) {
            console.log('PaymentTransaction create', e);
            throw new Error('Unable to create transaction');
        }

        try {
            let timeout = this.expires - new Date();

            setTimeout(() => {
                let query = {
                    transaction_id: { $eq: this.transaction_id, },
                    status: { $eq: TRANSACTION_STATUSES.get('initial'), },
                };

                console.log("Transaction expired - " + this.transaction_id);
                db.findAndModify('transactions', query, { status: TRANSACTION_STATUSES.get('expired'), });
            }, timeout);
        }
        catch (e) {
            throw new errors_model.Warning ('Transaction created, but failed to set the expiration timeout');
        }

        return this;
    }

    async pay (payment_confirmation_details) {
        if (this.status === TRANSACTION_STATUSES.get('resolved')) {
            throw new Error("The transaction is already resolved");
        }
        else if (this.status === TRANSACTION_STATUSES.get('processing')) {
            throw new Error("A payment is already being processed for this transaction");
        }
        else if (this.status === TRANSACTION_STATUSES.get('expired')) {
            throw new Error("Transaction expired");
        }
        else if (!payment_confirmation_details.coins.every(coin => this.currency === utils.Coin(coin).c)) {
            throw new Error("Some coins are not from the requested currency");
        }
        else if (utils.coinsValue(payment_confirmation_details.coins) < this.value) {
            throw new Error("The value of sent coins is not enough");
        }

        let coins_domain = utils.Coin(payment_confirmation_details.coins[0]).d;

        if (this.acceptable_issuers[0] !== "*" && !payment_confirmation_details.coins.every((coin) => {
            coin = utils.Coin(coin);
            return this.acceptable_issuers.includes(coin.d) && coin.d === coins_domain;
        })) {
            throw new Error(`Some coins are not from the list of acceptable issuers or selected coins are from different issuers.`);
        }

        this.status = TRANSACTION_STATUSES.get('processing');
        this.confirmation_details = payment_confirmation_details;

        let db_session = db.getClient().startSession();
        await db_session.startTransaction();

        let issuer_begin_response, account;

        try {
            this.initDBSession(db_session);

            [ account, issuer_begin_response, ] = await Promise.all([
                account_model.Account.find(this.account_id),
                issuer.post('begin', { issuerRequest: { fn: "verify", } }, coins_domain),
                this.save(),
            ]);

            if (!account) {
                throw new Error("Payment account does not exist");
            }

            /* TODO: commiting transaction here bring a risk that transaction may stuck in processing status if
                verification fails for any reason. For now I will try to revert transaction back to initial state and
                remove confirmation details in catch block but this is not a perfect solution as save in catch block
                can fail as well.
                On the other hand if transaction fails after this commit for example on verify level, we may try to proceed
                it later on one more time as we have all the details saved.
                Currently if anything breaks and throws error in this try/catch block I'm trying to rever transaction to
                it's original state with initial status
             */
            // Commit to set transaction as processing in order to prevent new payments of modifying this transaction
            await db_session.commitTransaction();

            let issuer_verify_response = await issuer.post('verify', {
                issuerRequest: {
                    tid: issuer_begin_response.issuerResponse.headerInfo.tid,
                    expiry: this.expires,
                    coin: payment_confirmation_details.coins,
                    targetValue: this.value,
                    issuePolicy: "single",
                }
            }, coins_domain);
                // {
                // issuerResponse: {
                //     coin: 'eyJjIjoiWEJUIiwidiI6IjAuMDEiLCJkIjoiZXUuY2Fycm90cGF5LmNvbSJ9',
                //     verifyInfo: {a:'b',
                //         actualValue:"0.01"}
                // }};


            let verified_coins = issuer_verify_response.issuerResponse.coin;
            let verify_info = issuer_verify_response.issuerResponse.verifyInfo;

            if (verify_info.actualValue < this.value) {
                throw new Error("The value of verified coins is not enough");
            }

            // TODO: make a class
            let coin_data = {
                account_id: this.account_id,
                coins: verified_coins,
                currency: this.currency,
                date: new Date(),
                value: verify_info.actualValue,
                transaction_id: this.transaction_id,
            };

            if (payment_confirmation_details.memo) {
                coin_data.memo = payment_confirmation_details.memo;
            }

            if (payment_confirmation_details.client_type) {
                coin_data.client_type = payment_confirmation_details.client_type;
            }

            if (this.order_id) {
                coin_data.order_id = this.order_id;
            }

            this.status = TRANSACTION_STATUSES.get('resolved');
            this.verify_details = verify_info;
            this.paid = new Date();

            await Promise.all([
                db.insert('coins', coin_data),
                this.save(),
                //TODO: Is this really necessary? what if this fails? should I revert the transaction?
                issuer.post('end', {
                    issuerRequest: {
                        tid: issuer_begin_response.issuerResponse.headerInfo.tid
                    }
                }, coins_domain),
            ]);

            return {
                status: "ok",
                wallet_id: payment_confirmation_details.wallet_id,
                return_url: this.return_url,
                memo: this.notification,
                seller: this.seller,
            };
        }
        catch (e) {
            console.log("Failed during finalising payment: " + e.toString());

            try {
                if (coins_domain && issuer_begin_response) {
                    issuer.post('end', {
                        issuerRequest: {
                            tid: issuer_begin_response.issuerResponse.headerInfo.tid
                        }
                    }, coins_domain);
                }
            }
            catch (e) {
                console.log("Failed during sending 'end' to an issuer: " + e.toString());
            }


            await db_session.abortTransaction();

            try {
                this.status = TRANSACTION_STATUSES.get('initial');
                this.confirmation_details = undefined;
                await db_session.startTransaction();
                await this.save();
                await db_session.commitTransaction();
            }
            catch (e) {
                console.log("Failed during finalising payment - unable to revert transaction to original state: " + e.toString());
            }

            throw e;
        }
        finally {
            this.closeDBSession();
            await db_session.endSession();
        }
    }
}

const BLOCKCHAIN_TRANSFER_TRANSACTION_ALLOWED_PROPERTIES = new Set([ 'type', 'currency', 'value', 'description', 'speed', 'address', 'label', ]);
const BLOCKCHAIN_TRANSFER_TRANSACTION_REQUIRED_PROPERTIES = new Set([ 'type', 'currency', 'value', 'address', ]);

class BlockchainTransferTransaction extends CoreTransaction {
    static get ALLOWED_PROPERTIES () {
        return BLOCKCHAIN_TRANSFER_TRANSACTION_ALLOWED_PROPERTIES;
    }

    static get REQUIRED_PROPERTIES () {
        return BLOCKCHAIN_TRANSFER_TRANSACTION_REQUIRED_PROPERTIES;
    }

    constructor(init_data) {
        super(init_data);
    }
}

class CoinFileTransferTransaction extends CoreTransaction {
    constructor(init_data) {
        super(init_data);
    }
}

const TRANSACTION_CLASSES = new Map([
    [ TRANSACTION_TYPES.get('payment'), PaymentTransaction, ],
    [ TRANSACTION_TYPES.get('blockchain-transfer'), BlockchainTransferTransaction, ],
    [ TRANSACTION_TYPES.get('coin-file-transfer'), CoinFileTransferTransaction, ],
]);


exports.Transaction = class Transaction {
    constructor (init_data) {
        if (!init_data.type || !TRANSACTION_TYPES.has(init_data.type)) {
            throw new Error('Invalid type');
        }

        let transaction_class = TRANSACTION_CLASSES.get(TRANSACTION_TYPES.get(init_data.type));

        return new transaction_class(init_data);
    }

    /*      Static methods      */

    static get TYPES () { return TRANSACTION_TYPES; }

    static get STATUSES () { return TRANSACTION_STATUSES; }

    static async find({transaction_id, account_id, type, status, offset=0, limit=100, before, after, order="descending", order_by="paid", only_valid=true }) {
        try {
            // Check if all parameters are fine
            if (transaction_id) {
                const uuid_regex = /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

                if (!uuid_regex.exec(transaction_id)) {
                    throw new Error('Missing transaction_id');
                }
            }

            if (account_id && !(account_id instanceof ObjectId)) {
                throw new Error('Missing account_id');
            }

            if (!transaction_id && !account_id) {
                throw new Error('Either transaction_id or account_id has to be provided');
            }

            if (type && !TRANSACTION_TYPES.has(type)) {
                throw new Error('Invalid type');
            }

            if (status && !TRANSACTION_STATUSES.has(status)) {
                throw new Error('Invalid status');
            }

            if (!checks.isInteger(offset)) {
                throw new Error('Invalid offset');
            }

            if (!checks.isInteger(limit)) {
                throw new Error('Invalid limit');
            }

            if (!['ascending', 'descending'].includes(order)) {
                throw new Error('Invalid order');
            }

            if (!['paid', 'created','time'].includes(order_by)) {
                throw new Error('Invalid order_by');
            }

            if (before && !checks.isDate(before)) {
                throw new Error('Invalid before date');
            }

            if (after && !checks.isDate(after)) {
                throw new Error('Invalid after date');
            }

            // Initial query
            let query = {};

            if (account_id) {
                query.account_id = account_id;
            };

            // Find a specific transaction
            if (transaction_id) {
                query.transaction_id = transaction_id;
            }

            // Shows only transactions created before given date
            if (before) {
                query.created = { $lt: new Date(before), };
            }

            // Shows only transactions created after given date
            if (after) {
                query.created = { $gt: new Date(after), };
            }

            // Show only transactions of a given type
            if (type) {
                query.type = { $eq: type, };
            }

            // Shows only transactions in a given status
            if (status) {
                query.status = { $eq: status, };
            }
            // If status is not forced - by default - shows only valid, not expired/aborted transactions. If it's false transactions
            // in all statuses will be returned.
            else if (only_valid) {
                query.status = { $in: [
                        TRANSACTION_STATUSES.get('initial'),
                        TRANSACTION_STATUSES.get('resolved'),
                        TRANSACTION_STATUSES.get('processing'), ]
                };
            }

            let found_transactions = await db.find('transactions', query, {
                projection: { _id: 0, }, offset: parseInt(offset), limit: parseInt(limit), order: order, order_by: order_by,
            });

            return found_transactions.map(found_transaction => {

                let transaction = new Transaction({ type: found_transaction.type, [_initialise_empty_object]: true, });

                transaction[_transaction] = transaction.prepareInputData(found_transaction);

                return transaction;
            });
        }
        catch (e) {
            console.log('getTransactions', e);

            throw (e instanceof Error ? e : new Error(String(e)));
        }
    }
};

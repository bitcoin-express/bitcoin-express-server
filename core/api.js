"use strict";

const config = require('config');
const db = require(config.get('system.root_dir') + '/db');
const issuer_utils = require(config.get('system.root_dir') + '/issuer/utils');
const middleware = require(config.get('system.root_dir') + '/core/middlewares');
const helpers = require(config.get('system.root_dir') + '/core/helpers');
const errors_model = require(config.get('system.root_dir') + '/core/models/Errors');

const { ObjectId } = require('mongodb');
const { Message } = require(config.get('system.root_dir') + '/core/models/Message');
const { JSONResponseEnvelope } = require(config.get('system.root_dir') + '/core/models/JSONResponseEnvelope');
const { Transaction } = require(config.get('system.root_dir') + '/core/models/Transaction');
const { PaymentConfirmation } = require(config.get('system.root_dir') + '/core/models/PaymentConfirmation');
const { Account } = require(config.get('system.root_dir') + '/core/models/Account');
const { Settings } = require(config.get('system.root_dir') + '/core/models/Settings');

class APIError extends Error {}

const getTransactions = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});
    let query = {
        account_id: req.params._account_id,
    };

    for (let parameter of [ 'type', 'status', 'offset', 'limit', 'before', 'after', 'order', 'order_by', 'only_valid', ]) {
        if (req.query.hasOwnProperty(parameter)) {
            query[parameter] = req.query[parameter];
        }
    }

    try {
        if (!query.account_id) {
            throw new Error('Missing account_id');
        }

        response.body = await Transaction.find(query);
        response.success = true;
        res.status(200);
    }
    catch (e) {
        console.log('api getTransactions', e);

        response.messages.push(new Message({ body: "Unable to retrieve transactions", type: Message.TYPE_ERROR, }));
        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};

const postTransactions = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});

    try {
        let transaction = undefined;

        try {
            transaction = await new Transaction({ ...req.body, account: req.params._account, }).create();
        }
        catch (e) {
            if (!(e instanceof errors_model.Warning)) {
                throw e;
            }
            console.log('api postTransactions warning', e);
        }

        response.body.push(transaction);
        response.success = true;
        response.messages.push(new Message({ body: "Transaction created", type: Message.TYPE_INFO, }));
        res.status(200);
    }
    catch (e) {
        console.log('api postTransactions', e);

        response.messages.push(new Message({ body: "Unable to create transaction", type: Message.TYPE_ERROR, }));
        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};

const getTransactionById = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});
    let query = {
        // Authenticated account
        account_id: req.params._account_id,

        // Transaction id passed in url
        transaction_id: req.params.transaction_id,

        limit: 1,

        // In order to also return transactions that are not "valid" we need to disable this check
        only_valid: false,
    };

    try {
        if (!query.account_id) {
            throw new Error('Missing account_id');
        }

        response.body = await Transaction.find(query);

        // If we can't find a transaction with a given id under authenticated account we should treat it as an error.
        // This is different behaviour from when we are asking for a set of transactions and get an empty result.
        if (!response.body.length) { throw new Error(`Unable to find transaction with id: ${query.transaction_id} on account: ${query.account_id}`); }

        response.success = true;
        res.status(200);
    }
    catch (e) {
        console.log('api getTransactionById', e);

        response.messages.push(new Message({ body: "Unable to retrieve transaction", type: Message.TYPE_ERROR, }));
        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};


const postTransactionByIdPayment = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});

    let query = {
        // Transaction id passed in url
        transaction_id: req.params.transaction_id,
        status: Transaction.STATUSES.get('initial'),

        limit: 1,

        // In order to also return transactions that are not "valid" we need to disable this check
        only_valid: false,
    };

    let transaction, payment_details, payment_ack;

    try {
        transaction = await Transaction.find(query);
        transaction = transaction[0];

        if (!transaction) {
            throw new Error ('Failed to find transaction');
        }

        try {
            payment_details = new PaymentConfirmation(req.body);

            console.log(transaction);
            payment_ack = await transaction.pay(payment_details);

            response.body.push(payment_ack);
            response.success = true;
            res.status(200);
        }
        catch (e) {
            console.log('api postTransactionByIdPayment', e);

            response.messages.push(new Message({ body: "Unable to pay for transaction", type: Message.TYPE_ERROR, }));
            res.status(400);
        }
    }
    catch (e) {
        console.log('api postTransactionByIdPayment', e);
        // TODO: should it be like this?
        // response.body.push({ status: 'transaction_unknown', });

        response.messages.push(new Message({ body: "Invalid transaction", type: Message.TYPE_ERROR, }));
        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};


const postAccounts = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});
    let account_data = {};

    try {
        // Check if all passed keys are allowed
        for (let key of Object.keys(req.body)) {
            if (!config.get('_register_allowed_keys').includes(key)) {
                throw new APIError(`Unknown key: ${key}`);
            }
        }

        // Check if all required keys are passed
        let missing_required_keys = [];
        for (let required_key of config.get('_register_required_keys')) {
            if (!req.body.hasOwnProperty(required_key)) {
                missing_required_keys.push(required_key);
            }
        }

        if (missing_required_keys.length) {
            throw new APIError(`Missing required keys: ${missing_required_keys.join(', ')}`);
        }

        // Prepare allowed keys
        for (let parameter of [ 'domain', 'email_account_contact', 'email_customer_contact', 'name', ]) {
            if (req.body.hasOwnProperty(parameter)) {
                account_data[parameter] = req.body[parameter];
            }
        }

        let account = await new Account(account_data).create();
        response.body.push(account);
        response.success = true;
        response.messages.push(new Message({ body: "Account created", type: Message.TYPE_INFO, }));
        res.status(201);
    }
    catch (e) {
        console.log('api postAccounts', e);

        let error_message = e instanceof APIError ? e.toString() : 'Unable to create an account';
        response.messages.push(new Message({ body: error_message, type: Message.TYPE_ERROR, }));

        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};

const getAccountSettings = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});

    try {
        response.body.push(req.params._account.settings);
        response.success = true;
        res.status(200);
    }
    catch (e) {
        console.log('api getAccountSettings', e);

        let error_message = e instanceof APIError ? e.toString() : "Unable to retrieve account's settings"
        response.messages.push(new Message({ body: error_message, type: Message.TYPE_ERROR, }));

        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};

const patchAccountSettings = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});

    try {
        let new_settings = req.params._account.settings.clone();

        for (let setting of Object.keys(req.body)) {
            new_settings[setting] = req.body[setting];
        }
        req.params._account.settings = new_settings;
        req.params._account.saveSettings();

        response.body.push(req.params._account.settings);
        response.success = true;
        res.status(200);
    }
    catch (e) {
        console.log('api getAccountSettings', e);

        try {
            req.params._account = Account.find(req.params._account_id);
        }
        catch (e) {
            console.log('Unable to restore account after error: ' + e.toString());
        }

        let error_message = e instanceof APIError ? e.toString() : "Unable to update account's settings"
        response.messages.push(new Message({ body: error_message, type: Message.TYPE_ERROR, }));

        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};

const getAccountBalance = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});
    let currency = req.query.currency ? req.query.currency :  undefined;

    try {
        let coins = await db.getCoinList(currency, String(req.params._account_id));

        for (let currency of Object.keys(coins)) {
            response.body.push({
                currency: currency,
                value: issuer_utils.coinsValue(coins[currency]),
                number_of_coins: coins[currency].length,
            });
        }

        response.success = true;
        res.status(200);

        //TODO: should we add fiat rates on demand?
    }
    catch (e) {
        console.log('api getAccountBalance', e);

        let error_message = e instanceof APIError ? e.toString() : 'Unable to retrieve coins balance';
        response.messages.push(new Message({ body: error_message, type: Message.TYPE_ERROR, }));

        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};


const _returnOriginalPath = function (id) { return this.path; };

exports.routes = new Map([
    [ 'getTransactions', {
            path: '/v1.0a/transactions',
            method: 'get',
            actions: [ middleware.requireAuthentication, helpers.asyncWrapper(getTransactions), ],
            getPathForId: _returnOriginalPath,
        },
    ],
    [ 'postTransactions', {
            path: '/v1.0a/transactions',
            method: 'post',
            actions: [ middleware.requireAuthentication, helpers.asyncWrapper(postTransactions), ],
            getPathForId: _returnOriginalPath,
        },
    ],
    [ 'getTransactionById', {
            path: '/v1.0a/transaction/:transaction_id',
            method: 'get',
            actions: [ middleware.requireAuthentication, helpers.asyncWrapper(getTransactionById), ],
            getPathForId: function (id) { return `/v1.0a/transaction/${id}`; },
        },
    ],
    [ 'postTransactionPayment', {
            path: '/v1.0a/transaction/:transaction_id/payment',
            method: 'post',
            actions: [ middleware.noAuthentication, helpers.asyncWrapper(postTransactionByIdPayment), ],
            getPathForId: function (id) { return `/v1.0a/transaction/${id}/payment`; },
        },
    ],
    [ 'postAccounts', {
            path: '/v1.0a/accounts',
            method: 'post',
            actions: [ middleware.noAuthentication, helpers.asyncWrapper(postAccounts), ],
            getPathForId: _returnOriginalPath,
        },
    ],
    [ 'getAccountSettings', {
            path: '/v1.0a/account/settings',
            method: 'get',
            actions: [ middleware.requireAuthentication, helpers.asyncWrapper(getAccountSettings), ],
            getPathForId: _returnOriginalPath,
        },
    ],
    [ 'patchAccountSettings', {
            path: '/v1.0a/account/settings',
            method: 'patch',
            actions: [ middleware.requireAuthentication, helpers.asyncWrapper(patchAccountSettings), ],
            getPathForId: _returnOriginalPath,
        },
    ],
    [ 'patchAccountSettings', {
            path: '/v1.0a/account/balance',
            method: 'get',
            actions: [ middleware.requireAuthentication, helpers.asyncWrapper(getAccountBalance), ],
            getPathForId: _returnOriginalPath,
        },
    ],
]);

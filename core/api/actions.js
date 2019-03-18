"use strict";

/**
 * API actions' definitions.
 *
 * These actions are used by [API]{@link module:core/api} to execute a required action for a specific endpoint.
 * All actions are asynchronous, Express-valid functions. All actions, with an exception of postTransactionByIdPayment,
 * returns [enveloped JSON responses]{@link module:core/models/JSONResponses}
 * @module core/api/actions
 * @link module:core/api
 */

const config = require('config');
const db = require(config.get('system.root_dir') + '/db');

const issuer_utils = require(config.get('system.root_dir') + '/issuer/utils');
const errors = require(config.get('system.root_dir') + '/core/models/Errors');
const endpoints = require(config.get('system.root_dir') + '/core/api/endpoints');

const { Message } = require(config.get('system.root_dir') + '/core/models/Message');
const { JSONResponse, JSONResponseEnvelope } = require(config.get('system.root_dir') + '/core/models/JSONResponses');
const { Transaction } = require(config.get('system.root_dir') + '/core/models/Transaction');
const { PaymentAck } = require(config.get('system.root_dir') + '/core/models/PaymentAck');
const { PaymentConfirmation } = require(config.get('system.root_dir') + '/core/models/PaymentConfirmation');
const { Account } = require(config.get('system.root_dir') + '/core/models/Account');
const { Settings } = require(config.get('system.root_dir') + '/core/models/Settings');
class APIError extends Error {}


/**
 * Returns a list of transactions specified by the passed options
 * @param {object} req - The Express' request object
 * @param {object} res - The Express' response object
 * @param {function} next - function to be called to proceed with the Express' chain of execution
 * @returns {Promise}
 * @link module:core/models/Transaction
 * @link module:core/models/JSONResponses
 */
exports.getTransactions = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});
    let query = {
        // Authenticated account's id
        account_id: req.params._account_id,
    };

    // We are taking only parameters supported by this endpoint and ignoring the rest.
    // We could return an error in case of encountering a key that is not on the supported list - it is only a matter of
    // a design decision to do not returns errors unless this is absolutely necessary.
    for (let parameter of [ 'type', 'status', 'offset', 'limit', 'before', 'after', 'order', 'order_by', 'only_valid', ]) {
        if (req.query.hasOwnProperty(parameter)) {
            query[parameter] = req.query[parameter];
        }
    }

    try {
        // We are only allowing to access own transactions, so if by any chance account_id is not provided we have
        // to quit
        if (!query.account_id) {
            throw new Error('Missing account_id');
        }

        response.body = await Transaction.find(query);
        response.success = true;
        res.status(200);
    }
    catch (e) {
        console.log('api getTransactions', e);

        response.messages.push(new Message({ body: "Unable to retrieve transactions", type: Message.TYPE__ERROR, }));
        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};


/**
 * Creates a new transaction of a specified type
 * @param {object} req - The Express' request object
 * @param {object} res - The Express' response object
 * @param {function} next - function to be called to proceed with the Express' chain of execution
 * @returns {Promise}
 * @link module:core/models/Transaction
 * @link module:core/models/JSONResponses
 */
exports.postTransactions = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});

    try {
        // Payment type request has a different form so we have transform it to suit other types as well
        if (!req.body.type) {
            req.body.type = 'payment';
        }

        Transaction.checkAPIProperties(body);

        let transaction = undefined;

        try {
            // We are passing all parameters passed in request's body, together with the account's object to
            // the Transaction' class constructor. We do not have to check what keys were passed as Transaction will
            // simply ignore everything that is not on the allowed keys list and checks required keys on calling
            // "create"
            transaction = await new Transaction({ ...req.body, account: req.params._account, }).create();
        }
        catch (e) {
            console.log('api postTransactions warning', e);
            throw e;
        }

        response.body.push(transaction);
        response.success = true;
        response.messages.push(new Message({ body: "Transaction created", type: Message.TYPE__INFO, }));
        res.status(200);
    }
    catch (e) {
        console.log('api postTransactions', e);

        response.messages.push(new Message({ body: "Unable to create transaction", type: Message.TYPE__ERROR, }));
        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};


/**
 * Returns an information about the transaction identified by the id
 * @param {object} req - The Express' request object
 * @param {object} res - The Express' response object
 * @param {function} next - function to be called to proceed with the Express' chain of execution
 * @returns {Promise}
 * @link module:core/models/Transaction
 * @link module:core/models/JSONResponses
 */
exports.getTransactionById = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});
    let query = {
        // Authenticated account'd id
        account_id: req.params._account_id,

        // Transaction id passed in the URL
        transaction_id: req.params.transaction_id,

        limit: 1,

        // In order to also return transactions that are not "valid" we need to disable this check
        only_valid: false,
    };

    try {
        // We are only allowing to access own transactions, so if by any chance account_id is not provided we have
        // to quit
        if (!query.account_id) {
            throw new Error('Missing account_id');
        }

        response.body = await Transaction.find(query);

        // If we can't find a transaction with a given id under authenticated account we should treat it as an error.
        // This is a different behaviour from when we are asking for a set of transactions and get an empty result.
        if (!response.body.length) { throw new Error(`Unable to find transaction with id: ${query.transaction_id} on account: ${query.account_id}`); }

        response.success = true;
        res.status(200);
    }
    catch (e) {
        console.log('api getTransactionById', e);

        response.messages.push(new Message({ body: "Unable to retrieve transaction", type: Message.TYPE__ERROR, }));
        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};


/**
 * Returns an information about the transaction identified by the order id
 * @param {object} req - The Express' request object
 * @param {object} res - The Express' response object
 * @param {function} next - function to be called to proceed with the Express' chain of execution
 * @returns {Promise}
 * @link module:core/models/Transaction
 * @link module:core/models/JSONResponses
 */
exports.getTransactionByOrderId = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});
    let query = {
        // Authenticated account'd id
        account_id: req.params._account_id,

        // Order id passed in the URL
        custom_query: {
            order_id: req.params.order_id,
        },

        limit: 1,

        // In order to also return transactions that are not "valid" we need to disable this check
        only_valid: false,
    };

    try {
        // We are only allowing to access own transactions, so if by any chance account_id is not provided we have
        // to quit
        if (!query.account_id) {
            throw new Error('Missing account_id');
        }

        response.body = await Transaction.find(query);

        // If we can't find a transaction with a given order id under authenticated account we should treat it as
        // an error. This is a different behaviour from when we are asking for a set of transactions and get an empty
        // result.
        if (!response.body.length) { throw new Error(`Unable to find transaction with order id: ${req.params.order_id} on account: ${query.account_id}`); }

        response.success = true;
        res.status(200);
    }
    catch (e) {
        console.log('api getTransactionById', e);

        response.messages.push(new Message({ body: "Unable to retrieve transaction", type: Message.TYPE__ERROR, }));
        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};


/**
 * Tries to resolve the transaction specified by the id of the "payment" type. It accepts a payment confirmation from
 * the Buyer in a format defined by the [PaymentConfirmation class]{@link module:core/models/PaymentConfirmation} and
 * return the [PaymentAck object]{@link module:core/models/PaymentConfirmation} specified in the Bitcoin-Express Payment
 * specification.
 *
 * This is the only method that send back JSON response NOT wrapped in a standard [JSON envelope]@{@link module:core/models/JSONResponses}
 * @param {object} req - The Express' request object
 * @param {object} res - The Express' response object
 * @param {function} next - function to be called to proceed with the Express' chain of execution
 * @returns {Promise}
 * @link module:core/models/Transaction
 * @link module:core/models/PaymentAck
 * @link module:core/models/PaymentConfirmation
 * @link module:core/models/JSONResponse
 */
exports.postTransactionByIdPayment = async (req, res, next) => {
    let query = {
        // Transaction id passed in url
        transaction_id: req.params.transaction_id,

        // We can pay only por a transaction in the initial state
        status: Transaction.STATUS__INITIAL,

        // Only payment type transactions are supporting this operation
        type: Transaction.TYPE__PAYMENT,

        limit: 1,

        // In order to also include transactions that are not "valid" we need to disable this check
        only_valid: false,
    };

    let transaction, payment_confirmation, payment_ack, response = '';

    try {
        try {
            // Check if only allowed fields were send in the request...
            PaymentConfirmation.checkAPIProperties(req.body.Payment);
            // ...and if yes, try to initialise a new PaymentConfirmation object using the request's body in order to extract necessary
            // and/or allowed keys. Throw an error if it fails...
            payment_confirmation = new PaymentConfirmation(req.body.Payment);
            // ... and check if all required fields are filled as well. Again - throw an error if they aren't.
            payment_confirmation.checkRequiredProperties();
        }
        catch (e) {
            console.log('Invalid payment confirmation request body', e);
            throw new Error('Invalid payment confirmation request body');
        }

        // Try to find a query that we are trying to pay for...
        transaction = await Transaction.find(query);
        transaction = transaction[0];

        // ...and if you can't - prepare the PaymentAck object with a proper, specified for this situation, status
        if (!transaction) {
            response = new PaymentAck({
                status: PaymentAck.STATUS__REJECTED,
                wallet_id: payment_confirmation.wallet_id,
            });

            throw new Error('Invalid transaction id');
        }


        // Feed payment_confirmation with transaction_id and order_id as these are required to be included in the
        // response
        payment_confirmation.transaction_id = transaction.transaction_id;
        if (transaction.order_id) {
            payment_confirmation.order_id = transaction.order_id;
        }


        let time_budget_counter = new Promise(
            (resolve) => setTimeout(
                () => { console.log('w time_buget_counter'); resolve(new PaymentAck({
                    status: PaymentAck.STATUS__DEFERRED,
                    retry_after: config.get('server.api.soft_error_retry_delay'),
                    wallet_id: payment_confirmation.wallet_id,
                })); },
                1 * 1000
            )
        );

        await Promise.race([ time_budget_counter, transaction.resolve(payment_confirmation), ]).then((result) => {
            console.log(result);
            payment_ack = result;
        });

        response = payment_ack;

        // We may continue only if the PaymentAck object was returned and only if it's in a valid state.
        // In any other case we should take 400 route and return generated payment_ack to the API caller.
        if (!payment_ack || payment_ack.status !== PaymentAck.STATUS__OK) {
            throw new Error ('Unable to resolve the transaction');
        }

        res.status(200);
    }
    catch (e) {
        console.log('api postTransactionByIdPayment', e);

        // In case the exception was generated before an actual response was formed we need to create one to be
        // compliant to the Bitcoin-Express Payment specification
        if (!response) {
            response = new PaymentAck({
                status: PaymentAck.STATUS__FAILED,
            });
        }

        res.status(400);
    }

    return res.send(new JSONResponse(response).prepareResponse(res));
};


/**
 * Cancels the transaction specified by the id of the "payment" type. It's working for non-terminal and non-resolved
 * Transactions leaving necessary actions to recover to actual payment process.
 *
 * @param {object} req - The Express' request object
 * @param {object} res - The Express' response object
 * @param {function} next - function to be called to proceed with the Express' chain of execution
 * @returns {Promise}
 * @link module:core/models/Transaction
 * @link module:core/models/JSONResponses
 */
exports.deleteTransactionByIdPayment = async (req, res, next) => {
    let query = {
        // Transaction id passed in url
        transaction_id: req.params.transaction_id,

        // Only payment type transactions are supporting this operation
        type: Transaction.TYPE__PAYMENT,

        limit: 1,

        // In order to also include transactions that are not "valid" we need to disable this check
        only_valid: false,
    };

    let transaction, response;

    try {
        // Try to find a query that we are trying to pay for...
        transaction = await Transaction.find(query);
        transaction = transaction[0];

        // ...and if you can't - prepare the PaymentAck object with a proper, specified for this situation, status
        if (!transaction) {
            response = new PaymentAck({
                status: PaymentAck.STATUS__REJECTED,
                wallet_id: req.body.wallet_id,
            });

            throw new Error('Invalid transaction id');
        }

        transaction.status = Transaction.STATUS__ABORTED;
        transaction.save({ overwrite_non_final_state_only: true, });

        console.log('api deleteTransactionByIdPayment post save');

        response = new PaymentAck({
            status: PaymentAck.STATUS__FAILED,
            wallet_id: req.body.wallet_id,
        });

        res.status(200);
    }
    catch (e) {
        console.log('api deleteTransactionByIdPayment', e);
        res.status(400);
    }

    return res.send(new JSONResponse(response).prepareResponse(res));
};


/**
 * Creates a new Merchant's account together with an initial set of settings.
 *
 * This method is tightly connected to the Gateway configuration and uses keys defined in the Account's section.
 * @param {object} req - The Express' request object
 * @param {object} res - The Express' response object
 * @param {function} next - function to be called to proceed with the Express' chain of execution
 * @returns {Promise}
 * @link module:core/models/Account
 * @link module:core/models/Settings
 * @link module:core/models/JSONResponses
 */
exports.postAccounts = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});
    let account_data = {};

    try {
        // As only a set of Account's properties is exposed via API and the Gateway operator may influence it by
        // changing the Gateway configuration we need to check passed keys
        Account.checkAPIProperties(req.body);

        // ...and do the same thing with required keys as these can be modified by the Gateway operator as well
        let missing_required_keys = [];
        for (let required_key of config.get('_register_required_keys')) {
            if (!req.body.hasOwnProperty(required_key)) {
                missing_required_keys.push(required_key);
            }
        }

        if (missing_required_keys.length) {
            throw new APIError(`Missing required keys: ${missing_required_keys.join(', ')}`);
        }

        // Prepare allowed keys to be passed to the Account's constructor
        for (let parameter of config.get('_register_allowed_keys')) {
            if (req.body.hasOwnProperty(parameter)) {
                account_data[parameter] = req.body[parameter];
            }
        }

        // Initialise the Account's object and create it
        let account = await new Account(account_data).create();

        response.body.push(account);
        response.success = true;
        response.messages.push(new Message({ body: "Account created", type: Message.TYPE__INFO, }));

        res.status(201);
    }
    catch (e) {
        console.log('api postAccounts', e);

        let error_message = e instanceof APIError ? e.toString() : 'Unable to create an account';
        response.messages.push(new Message({ body: error_message, type: Message.TYPE__ERROR, }));

        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};


/**
 * Returns information about the Merchant's account together with it's settings.
 * @param {object} req - The Express' request object
 * @param {object} res - The Express' response object
 * @param {function} next - function to be called to proceed with the Express' chain of execution
 * @returns {Promise}
 * @link module:core/models/Account
 * @link module:core/models/Settings
 * @link module:core/models/JSONResponses
 */
exports.getAccount = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});

    try {
        // As we are only allowing to read only data from the Merchant's own account we can reuse the object that we
        // received during authentication.
        response.body.push(req.params._account);
        response.success = true;
        res.status(200);
    }
    catch (e) {
        console.log('api getAccount', e);

        let error_message = e instanceof APIError ? e.toString() : "Unable to retrieve the account"
        response.messages.push(new Message({ body: error_message, type: Message.TYPE__ERROR, }));

        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};


/**
 * Updates selected information about the Merchant's account but not it's settings.
 * Account's settings can be modified using [settings endpoint]{@link patchSettings}
 * @param {object} req - The Express' request object
 * @param {object} res - The Express' response object
 * @param {function} next - function to be called to proceed with the Express' chain of execution
 * @returns {Promise}
 * @link module:core/models/Account
 * @link module:core/models/Settings
 * @link module:core/models/JSONResponses
 */
exports.patchAccount = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});

    try {
        // We have [a special endpoint]{@link patchSettings} for settings modification so if the Merchant's is trying to
        // modify them using this endpoint we are returning an error
        if (Object.keys(req.body).includes('settings')) {
            throw new errors.InvalidValueError({ message: `In order to change account's settings use ${endpoints.ACCOUNT_SETTINGS} endpoint` });
        }

        Account.checkAPIProperties(req.body);

        // We are working on the currently authenticated account but as we don't want to directly modify it we are preparing
        // a copy to work on it. It's a shallow copy but as we already excluded settings we can use it.
        let new_account = req.params._account.clone();

        // Try to assign all keys received from the Merchant. This will throw an error if there is a key passed that is
        // not recognised or read-only - mechanism implemented by the Account object itself.
        for (let property of Object.keys(req.body)) {
            new_account[property] = req.body[property];
        }

        // Save will check required fields as well so if there is something missing it will throw an error
        new_account.save();

        // The account was successfully modified so we can use it now
        req.params._account = new_account;

        response.body.push(new_account);
        response.success = true;

        res.status(202);
    }
    catch (e) {
        console.log('api patchAccount', e);

        let error_message = e instanceof APIError ? e.toString() : "Unable to update the account"
        response.messages.push(new Message({ body: error_message, type: Message.TYPE__ERROR, }));

        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};


/**
 * Returns information about the Merchant account's settings.
 * @param {object} req - The Express' request object
 * @param {object} res - The Express' response object
 * @param {function} next - function to be called to proceed with the Express' chain of execution
 * @returns {Promise}
 * @link module:core/models/Account
 * @link module:core/models/Settings
 * @link module:core/models/JSONResponses
 */
exports.getAccountSettings = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});

    try {
        // We are working on the currently authenticated account so we can simply use its settings
        response.body.push(req.params._account.settings);
        response.success = true;

        res.status(200);
    }
    catch (e) {
        console.log('api getAccountSettings', e);

        let error_message = e instanceof APIError ? e.toString() : "Unable to retrieve account's settings"
        response.messages.push(new Message({ body: error_message, type: Message.TYPE__ERROR, }));

        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};


/**
 * Updates selected keys in the Merchant account's settings.
 * @param {object} req - The Express' request object
 * @param {object} res - The Express' response object
 * @param {function} next - function to be called to proceed with the Express' chain of execution
 * @returns {Promise}
 * @link module:core/models/Account
 * @link module:core/models/Settings
 * @link module:core/models/JSONResponses
 */
exports.patchAccountSettings = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});

    try {
        Settings.checkAPIProperties(req.body);

        // We are working on the currently authenticated account but as we don't want to directly modify it we are
        // preparing a copy of its settings to work on it. It's a shallow copy but as settings has shallow structure
        // we can use it
        let new_settings = req.params._account.settings.clone();

        // Try to assign all keys received from the Merchant. This will throw an error if there is a key passed that is
        // not recognised or read-only - mechanism implemented by the Settings object itself.
        for (let setting of Object.keys(req.body)) {
            new_settings[setting] = req.body[setting];
        }

        // As settings object is stored inside the account's object it can't be saved on it's own so we have to assign
        // it to the account and run the [saveSettings]{@link module:core/models/Account/Account.saveSettings} method
        // in order to store them in the database
        req.params._account.settings = new_settings;
        req.params._account.saveSettings();

        response.body.push(req.params._account.settings);
        response.success = true;

        res.status(202);
    }
    catch (e) {
        console.log('api getAccountSettings', e);

        try {
            // If something breaks - restore the authenticated account to its original state
            req.params._account = Account.find(req.params._account_id);
        }
        catch (e) {
            console.log('Unable to restore account after error: ' + e.toString());
        }

        let error_message = e instanceof APIError ? e.toString() : "Unable to update account's settings"
        response.messages.push(new Message({ body: error_message, type: Message.TYPE__ERROR, }));

        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};


/**
 * Returns information about the amount of Coins stored on the Merchant's account.
 * @param {object} req - The Express' request object
 * @param {object} res - The Express' response object
 * @param {function} next - function to be called to proceed with the Express' chain of execution
 * @returns {Promise}
 * @link module:core/models/Account
 * @link module:core/models/JSONResponses
 */
exports.getAccountBalance = async (req, res, next) => {
    let response = new JSONResponseEnvelope({});

    // We want to get a balance either for a defined currency or all of them - if undefined
    let currency = req.query.currency ? req.query.currency :  undefined;

    try {
        let coins = await db.getCoinList(String(currency), String(req.params._account_id));

        for (let currency of Object.keys(coins)) {
            // Each row represents coins in a different currency...
            response.body.push({
                // ...so we need to pass information about the currency itself...
                currency: currency,

                // ...total value of coins in this currency...
                value: issuer_utils.coinsValue(coins[currency]),

                // ...and number of coins in this currency.
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
        response.messages.push(new Message({ body: error_message, type: Message.TYPE__ERROR, }));

        res.status(400);
    }

    return res.send(response.prepareResponse(res));
};

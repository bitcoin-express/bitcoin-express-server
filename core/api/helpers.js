"use strict;"

/**
 * API helper functions' definition.
 * @module core/api/helpers
 * @link module:core/api
 */

const config = require('config');
const { Account } = require(config.get('system.root_dir') + '/core/models/Account');
const { JSONResponseEnvelope } = require(config.get('system.root_dir') + '/core/models/JSONResponses');
const { Message } = require(config.get('system.root_dir') + '/core/models/Message');


/**
 * Wrapper for async functions that should be passed to the Express router. As Express can't fully handle async calls
 * by default, we need to tell him what to do and handle errors from Promises correctly.
 * @param fn
 * @returns {function(...[*]): Promise<T | never>}
 */
exports.asyncWrapper = fn =>
    // Closure for a route specific action that should be executed by th Express router
    function asyncWrap(...args) {
        const result = fn(...args);
        const next = args[args.length-1];
        const res = args[args.length-2];

        return Promise.resolve(result).catch(error => {
            //TODO: log
            console.log('API router async wrapper - uncaught error', error);

            // We always want to return enveloped JSON response, even if something critically breaks on our end
            return res.type('application/json').status(500).send(new JSONResponseEnvelope({
                success: false,
                body: [],
                messages: [ new Message({
                    type: Message.TYPE__ERROR,
                    body: "Something went wrong on a server side and we couldn't handle that properly. Try again and in case of failing - contact us.",
                }),
                ],
            }).prepareResponse(res));
        });
    };


/**
 * Sensitive keys that should always be deleted from the data passed by the User as they are considered a possible
 * security threat to the Gateway. An attacker may try to pass them in order to gain access to unauthorized resources.
 * @type {string[]}
 * @static
 */
const API_SENSITIVE_KEYS = [ '_id', 'account_id', 'account', ];


/**
 * Callback to be used as a first action for any route's definition in [API Routes]{@link module:core/api.routes} that
 * requires authentication.
 * It checks if a valid authentication token was passed in the request and populates the request with the account's
 * data to be used by next actions.
 * @param {object} req - The Express' request object
 * @param {object} res - The Express' response object
 * @param {function} next - function to be called to proceed with the Express' chain of execution
 * @returns {Promise<*>}
 * @link module:core/api.routes
 */
exports.requireAuthentication = async function (req, res, next) {
    try {
        // If the authentication header is not passed - quit
        if (!req.headers["be-mg-auth-token"]) { throw new Error ('Missing authentication token'); }

        // Make sure that the request is clear from tampering and/or mistakenly passed keys that are not allowed to be
        // set via API
        for (let key of API_SENSITIVE_KEYS) {
            if (req.body.hasOwnProperty(key)) {delete req.body[key];}
            if (req.query.hasOwnProperty(key)) {delete req.query[key];}
        }

        // Try to find an account authenticated by the passed token
        let account = await Account.find(req.headers["be-mg-auth-token"]);

        // Save both account object and account_id for the API usage
        req.params._account_id = account.account_id;
        req.params._account = account;

        return next();
    }
    catch (e) {
        // We always want to return enveloped JSON response, even if something critically breaks on our end
        return res.type('application/json').status(401).send(new JSONResponseEnvelope({
            success: false,
            body: [],
            messages: [ new Message({
                type: Message.TYPE__ERROR,
                body: "Missing or invalid authentication token",
            }),
            ],
        }).prepareResponse(res));
    }
};


/**
 * Callback to be used as a first action for any route's definition in [API Routes]{@link module:core/api.routes} that
 * does not require authentication.
 * It simply passes the execution to the next chain member by calling {next}.
 * @param {object} req - The Express' request object
 * @param {object} res - The Express' response object
 * @param {function} next - function to be called to proceed with the chain execution
 * @returns {Promise<*>}
 * @link module:core/api.routes
 */
exports.noAuthentication = function (req, res, next) {
    return next();
};

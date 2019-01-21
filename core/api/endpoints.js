"use strict";

/**
 * Definition of to be used by the [API]{@link module:core/api}
 * @module core/api/endpoints
 * @link module:core/api
 */


/**
 * "transactions" endpoint definition
 * @type {string}
 * @const
 * @default
 */
exports.TRANSACTIONS = '/transactions';


/**
 * "transaction by id" endpoint definition
 * @type {string}
 * @const
 * @default
 * @link getPathForId
 */
exports.TRANSACTION_ID = '/transaction/:transaction_id';


/**
 * "transaction payment by id" endpoint definition
 * @type {string}
 * @const
 * @default
 * @link getPathForId
 */
exports.TRANSACTION_ID_PAYMENT = '/transaction/:transaction_id/payment';


/**
 * "accounts" endpoint definition
 * @type {string}
 * @const
 * @default
 */
exports.ACCOUNTS = '/accounts';


/**
 * "account" endpoint definition
 * @type {string}
 * @const
 * @default
 */
exports.ACCOUNT = '/account';


/**
 * "account's settings" endpoint definition
 * @type {string}
 * @const
 * @default
 */
exports.ACCOUNT_SETTINGS = '/account/settings';


/**
 * "account's balance" endpoint definition
 * @type {string}
 * @const
 * @default
 */
exports.ACCOUNT_BALANCE = '/account/balance';


/**
 * Returns a path with any id placeholder replaced by the real id value.
 * @param {string} path
 * @param {string} id
 * @returns {string} path - path with a modified id parameter to include a real id, instead of an id's placeholder.
 * For paths without an id the original path will be returned.
 */
exports.getPathForId = (path, id, ) => {
    if (path === exports.TRANSACTION_ID) { return `/transaction/${id}`; }
    else if (path === exports.TRANSACTION_ID_PAYMENT) { return `/transaction/${id}/payment`; }
    else { return path; }
};


/**
 * Returns a final path for a given endpoin, wrapping it in necessary prefixes like API version.
 * @param {string} path
 * @returns {string} - the final path's version to be used in a route
 */
exports.getEndpointPath = (path) => {
    return `/v1.0a${path}`;
};


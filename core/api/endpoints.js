"use strict";

exports.TRANSACTIONS = '/transactions';
exports.TRANSACTION_ID = '/transaction/:transaction_id';
exports.TRANSACTION_ID_PAYMENT = '/transaction/:transaction_id/payment';
exports.ACCOUNTS = '/accounts';
exports.ACCOUNT = '/account';
exports.ACCOUNT_SETTINGS = '/account/settings';
exports.ACCOUNT_BALANCE = '/account/balance';

exports.getPathForId = (path, id, ) => {
    if (path === exports.TRANSACTION_ID) {
        return `/transaction/${id}`;
    }
    else if (path === exports.TRANSACTION_ID_PAYMENT) {
        return `/transaction/${id}/payment`;
    }
    else {
        return path;
    }
};

exports.getEndpointPath = (path) => {
    return `/v1.0a${path}`;
};


"use strict";

const config = require('config');
const middleware = require(config.get('system.root_dir') + '/core/middlewares');
const helpers = require(config.get('system.root_dir') + '/core/helpers');
const actions = require(config.get('system.root_dir') + '/core/api/actions');
const endpoints = require(config.get('system.root_dir') + '/core/api/endpoints');

exports.routes = new Map([
    [ 'getTransactions', {
            path: endpoints.getEndpointPath(endpoints.TRANSACTIONS),
            method: 'get',
            actions: [ middleware.requireAuthentication, helpers.asyncWrapper(actions.getTransactions), ],
        },
    ],
    [ 'postTransactions', {
            path: endpoints.getEndpointPath(endpoints.TRANSACTIONS),
            method: 'post',
            actions: [ middleware.requireAuthentication, helpers.asyncWrapper(actions.postTransactions), ],
        },
    ],
    [ 'getTransactionById', {
            path: endpoints.getEndpointPath(endpoints.TRANSACTION_ID),
            method: 'get',
            actions: [ middleware.requireAuthentication, helpers.asyncWrapper(actions.getTransactionById), ],
        },
    ],
    [ 'postTransactionPayment', {
            path: endpoints.getEndpointPath(endpoints.TRANSACTION_ID_PAYMENT),
            method: 'post',
            actions: [ middleware.noAuthentication, helpers.asyncWrapper(actions.postTransactionByIdPayment), ],
        },
    ],
    [ 'postAccounts', {
            path: endpoints.getEndpointPath(endpoints.ACCOUNTS),
            method: 'post',
            actions: [ middleware.noAuthentication, helpers.asyncWrapper(actions.postAccounts), ],
        },
    ],
    [ 'getAccount', {
            path: endpoints.getEndpointPath(endpoints.ACCOUNT),
            method: 'get',
            actions: [ middleware.requireAuthentication, helpers.asyncWrapper(actions.getAccount), ],
        },
    ],
    [ 'patchAccount', {
            path: endpoints.getEndpointPath(endpoints.ACCOUNT),
            method: 'patch',
            actions: [ middleware.requireAuthentication, helpers.asyncWrapper(actions.patchAccount), ],
        },
    ],
    [ 'getAccountSettings', {
            path: endpoints.getEndpointPath(endpoints.ACCOUNT_SETTINGS),
            method: 'get',
            actions: [ middleware.requireAuthentication, helpers.asyncWrapper(actions.getAccountSettings), ],
        },
    ],
    [ 'patchAccountSettings', {
            path: endpoints.getEndpointPath(endpoints.ACCOUNT_SETTINGS),
            method: 'patch',
            actions: [ middleware.requireAuthentication, helpers.asyncWrapper(actions.patchAccountSettings), ],
        },
    ],
    [ 'getAccountBalance', {
            path: endpoints.getEndpointPath(endpoints.ACCOUNT_BALANCE),
            method: 'get',
            actions: [ middleware.requireAuthentication, helpers.asyncWrapper(actions.getAccountBalance), ],
        },
    ],
]);

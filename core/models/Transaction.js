"use strict";

const config = require('config');
const db = require(config.get('system.root_dir') + '/db');
const checks = require(config.get('system.root_dir') + '/core/checks');
const transaction_models = require(config.get('system.root_dir') + '/core/models/Transaction');

const { ObjectId } = require('mongodb');

exports.TRANSACTION_TYPES = new Map([
    [ 'payment', 'payment', ],
    [ 'blockchain-transfer', 'blockchain-transfer', ],
    [ 'coin-file-transfer', 'coin-file-transfer', ],
]);

exports.TRANSACTION_STATUES = new Map([
    [ 'initial', 'initial', ],
    [ 'resolved', 'resolved', ],
    [ 'aborted', 'aborted', ],
    [ 'expired', 'expired', ],
    [ 'processing', 'processing', ],
]);

exports.Transaction = class Transaction {

    /*      Static methods      */

    static async find({transaction_id, account_id, type, status, offset=0, limit=100, before, after, order="descending", order_by="paid", only_valid=true }) {
        try {
            // Check if all parameters are fine
            if (transaction_id && !(transaction_id instanceof ObjectId)) {
                throw new Error('Missing account_id');
            }

            if (!account_id || !(account_id instanceof ObjectId)) {
                throw new Error('Missing account_id');
            }

            if (type && !transaction_models.TRANSACTION_TYPES.has(type)) {
                throw new Error('Invalid type');
            }

            if (status && !transaction_models.TRANSACTION_STATUES.has(status)) {
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
            let query = {
                account_id: account_id,
            };

            // Find a specific transaction
            if (transaction_id) {
                query._id = transaction_id;
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
                        transaction_models.TRANSACTION_STATUES.get('initial'),
                        transaction_models.TRANSACTION_STATUES.get('resolved'),
                        transaction_models.TRANSACTION_STATUES.get('processing'), ]
                };
            }

            return await db.find('transactions', query, {
                projection: {_id: 0, account_id: 0, }, offset: parseInt(offset), limit: parseInt(limit), order: order, order_by: order_by,
            });
        }
        catch (e) {
            console.log('getTransactions', e);

            throw (e instanceof Error ? e : new Error(String(e)));
        }
    }
};

"use strict";

const config = require('config');
const { BaseError } = require(config.get('system.root_dir') + '/core/models/Errors/BaseError');

exports.PersistenceError = class PersistenceError extends BaseError {
    toString () {
        let message = this.message || 'persistence error';
        return `${this.message_prefix}${message}`;
    }
};

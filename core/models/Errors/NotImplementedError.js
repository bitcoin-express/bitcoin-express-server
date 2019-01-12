"use strict";

const config = require('config');
const { BaseError } = require(config.get('system.root_dir') + '/core/models/Errors/BaseError');

exports.NotImplementedError = class NotImplementedError extends BaseError {
    toString () {
        let message = this.message || 'is not implemented';
        return `${this.message_prefix}${message}`;
    }
};

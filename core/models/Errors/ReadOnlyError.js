"use strict";

const config = require('config');
const { BaseError } = require(config.get('system.root_dir') + '/core/models/Errors/BaseError');

exports.ReadOnlyError = class ReadOnlyError extends BaseError {
    toString () {
        let message = this.message || 'is read-only';
        return `${this.message_prefix}${message}`;
    }
};

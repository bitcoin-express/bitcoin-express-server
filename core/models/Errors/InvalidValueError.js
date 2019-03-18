"use strict";

const config = require('config');
const { BaseError } = require(config.get('system.root_dir') + '/core/models/Errors/BaseError');

exports.InvalidValueError = class InvalidValueError extends BaseError {
    toString () {
        let message = this.message || 'has invalid value';
        return `${this.message_prefix}${message}`;
    }
};

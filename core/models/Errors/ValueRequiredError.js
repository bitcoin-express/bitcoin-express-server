"use strict";

const config = require('config');
const { BaseError } = require(config.get('system.root_dir') + '/core/models/Errors/BaseError');

exports.ValueRequiredError = class ValueRequiredError extends BaseError {
    toString () {
        let message = this.message || 'is required';
        return `${this.message_prefix}${message}`;
    }
};

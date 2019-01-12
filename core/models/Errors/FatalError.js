"use strict";

const config = require('config');
const { BaseError } = require(config.get('system.root_dir') + '/core/models/Errors/BaseError');

exports.FatalError = class FatalError extends BaseError {
    toString () {
        let message = this.message || 'fatal error';
        return `${this.message_prefix}${message}`;
    }
};

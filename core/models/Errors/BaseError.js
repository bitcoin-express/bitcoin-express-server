"use strict";

exports.BaseError = class BaseError extends Error {
    constructor ({ class_name, field, message, }={}) {
        super();

        this.class = class_name;
        this.field = field;
        this.message = message;
        this.message_prefix = (this.class && `[${this.class}]: `) + (this.field && `${this.field}: `);
    }
};

"use strict";

exports.MessageAction = class MessageAction {
    constructor({ body="", action="", }) {
        // Initial checks
        if (!body || !body.length || typeof body !== "string" ) { throw new Error('MessageAction body must be a non-empty string'); }
        if (!action || !action.length || typeof action !== "string" ) { throw new Error('MessageAction action must be a non-empty string'); }

        // Properties initialisation
        this.body = body;
        this.action = action;
    }
};

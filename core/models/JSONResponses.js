"use strict";

/**
 * This module defines classes responsible for common API response wrappers to ensure that all API responses will have
 * the same structure and will use the same mechanisms.
 * @module core/models/Account
 * @link module:core/models/BaseModel
 */

exports.JSONResponseEnvelope = class JSONResponseEnvelope {
    constructor ({ body=[], messages=[], success=false}={}) {
        // Initial checks
        if (!Array.isArray(body)) { throw new Error("JSONResponseEnvelope body should be an array."); }
        if (!Array.isArray(messages)) { throw new Error("JSONResponseEnvelope messages should be an array."); }
        if (typeof success !== typeof true) { throw new Error("JSONResponseEnvelope success should be a boolean."); }

        // Properties initialisation
        this.body = body;
        this.messages = messages;
        this.success = success;
    }

    /*      Methods     */

    prepareResponse (res) {
        res.type('application/json');

        return JSON.stringify(this);
    }
};

exports.JSONResponse = class JSONResponse {
    constructor (init_data={}) {
        Object.assign(this, init_data);
    }

    /*      Methods     */

    prepareResponse (res) {
        res.type('application/json');

        return JSON.stringify(this);
    }
};

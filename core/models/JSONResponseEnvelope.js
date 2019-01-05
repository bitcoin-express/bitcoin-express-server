"use strict";

exports.JSONResponseEnvelope = class JSONResponseEnvelope {
    constructor ({ body=[], messages=[], success=false}) {
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

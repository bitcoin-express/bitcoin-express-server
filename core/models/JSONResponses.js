"use strict";

/**
 * This module defines classes responsible for common API response wrappers to ensure that all API responses will have
 * the same structure and will use the same mechanisms.
 * @module core/models/JSONResponses
 * @link module:core/models/BaseModel
 */


/**
 * Class defining a non-enveloped JSON response. It simply sets response type as JSON and stringify its content.
 */
class JSONResponse {
    /**
     * Constructor copies properties of the passed object in order to stringify them.
     * @param init_data
     */
    constructor (init_data={}) {
        Object.assign(this, init_data);
    }


    /**
     * Sets response type to JSON and stringifies the object
     * @param {Object} res - Express' response object
     * @returns {string}
     */
    prepareResponse (res) {
        res.type('application/json');

        return JSON.stringify(this);
    }
}

exports.JSONResponse = JSONResponse;


/**
 * Class defining an enveloped version of the JSON response. It ensures that all API calls using this class as a wrapper
 * will ensure the same returned structure, no matter what type of object (or how many of them) will be returned.
 */
class JSONResponseEnvelope extends JSONResponse{
    /**
     * Creates initial envelope containers to be filled by methods using this wrapper.
     * @param {Object[]} body - returned object/objects
     * @param {Message[]} messages - Message type object that bears information to the API consumer about operation
     * result
     * @param {boolean} success - indicator if the operation was succeeded or not. This is especially important in
     * situations where "body" does not contain any elements but this is valid and expected behaviour
     */
    constructor ({ body=[], messages=[], success=false}={}) {
        super();

        if (!Array.isArray(body)) { throw new Error("JSONResponseEnvelope body should be an array."); }
        if (!Array.isArray(messages)) { throw new Error("JSONResponseEnvelope messages should be an array."); }
        if (typeof success !== typeof true) { throw new Error("JSONResponseEnvelope success should be a boolean."); }

        this.body = body;
        this.messages = messages;
        this.success = success;
    }
}

exports.JSONResponseEnvelope = JSONResponseEnvelope;


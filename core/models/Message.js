"use strict";

const config = require('config');
const { MessageAction } = require(config.get('system.root_dir') + '/core/models/MessageAction');

const MESSAGE_TYPE__INFO = 'info';
const MESSAGE_TYPE__WARNING = 'warning';
const MESSAGE_TYPE__NOTICE = 'notice';
const MESSAGE_TYPE__ERROR = 'error';
const MESSAGE_TYPE__PROMPT = 'prompt';

const MESSAGE_TYPES = new Set([
    MESSAGE_TYPE__INFO,
    MESSAGE_TYPE__WARNING,
    MESSAGE_TYPE__NOTICE,
    MESSAGE_TYPE__ERROR,
    MESSAGE_TYPE__PROMPT,
]);

exports.Message = class Message {
    constructor({ type=Message.TYPE__INFO, body="", actions=[], }) {
        //Initial checks
        if (!Message.TYPES.has(type)) { throw new Error('Invalid message type'); }
        if (!body || !body.length || typeof body !== "string" ) { throw new Error('Message body must be a non-empty string'); }
        if (actions.length && !actions.every(function (action) { return action instanceof MessageAction; })) { throw new Error('At least one message action is of invalid type'); }

        // Properties initialisation
        this.body = body;
        this.type = type;
        this.actions = actions;
    }

    /*      Static properties       */
    static get TYPES () { return MESSAGE_TYPES; }
    static get TYPE__INFO () { return MESSAGE_TYPE__INFO; }
    static get TYPE__WARNING () { return MESSAGE_TYPE__WARNING; }
    static get TYPE__NOTICE () { return MESSAGE_TYPE__NOTICE; }
    static get TYPE__ERROR () { return MESSAGE_TYPE__ERROR; }
    static get TYPE__PROMPT () { return MESSAGE_TYPE__PROMPT; }
}

"use strict";

const config = require('config');
const { MessageAction } = require(config.get('system.root_dir') + '/core/models/MessageAction');

exports.Message = class Message {
    constructor({ type=Message.TYPE_INFO, body="", actions=[], }) {
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

    static get TYPE_INFO () { return 'info'; }
    static get TYPE_WARNING () { return 'warning'; }
    static get TYPE_NOTICE () { return 'notice'; }
    static get TYPE_ERROR () { return 'error'; }
    static get TYPE_PROMPT () { return 'prompt'; }

    static get TYPES () { return MESSAGE_TYPES; }
};

const MESSAGE_TYPES = new Set([ this.Message.TYPE_INFO, this.Message.TYPE_WARNING, this.Message.TYPE_NOTICE, this.Message.TYPE_ERROR, this.Message.TYPE_PROMPT, ]);


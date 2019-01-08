"use strict";

exports.asyncWrapper = fn =>
    function asyncWrap(...args) {
        const result = fn(...args);
        const next = args[args.length-1];
        const res = args[args.length-2];

        return Promise.resolve(result).catch(error => {
            //TODO: log
            console.log('API router async wrapper - uncaught error', error);

            const { JSONResponseEnvelope } = require(config.get('system.root_dir') + '/core/models/JSONResponseEnvelope');
            const { Message } = require(config.get('system.root_dir') + '/core/models/Message');

            return res.type('application/json').status(500).send(new JSONResponseEnvelope({
                success: false,
                body: [],
                messages: [ new Message({
                    type: Message.TYPE_ERROR,
                    body: "Something went wrong on a server side and we couldn't handle that properly. Try again and in case of failing - contact us.",
                }),
                ],
            }).prepareResponse(res));
        });
    };

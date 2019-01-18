"use strict";

const crypto = require('crypto');
const ecies = require('ecies-lite');

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
                    type: Message.TYPE__ERROR,
                    body: "Something went wrong on a server side and we couldn't handle that properly. Try again and in case of failing - contact us.",
                }),
                ],
            }).prepareResponse(res));
        });
    };


exports.encrypt = function (public_key, message) {
    let encryption_body = ecies.encrypt(Buffer.from(public_key, 'hex'), Buffer.from(message));
    return Buffer.from(JSON.stringify(encryption_body)).toString('base64');
};

exports.decrypt = function (private_key, encoded_encryption_body) {
    let ascii_body = Buffer.from(encoded_encryption_body, 'base64').toString('ascii');
    let encryption_body = JSON.parse(ascii_body);

    for (let prop of Object.keys(encryption_body)) {
        encryption_body[prop] = Buffer.from(encryption_body[prop].data);
    }

    return ecies.decrypt(Buffer.from(private_key, 'hex'), encryption_body).toString('utf-8');
};

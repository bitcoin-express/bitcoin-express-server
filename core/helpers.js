"use strict";

/**
 * Functions common to the whole application, that are not a part of any specific class or module.
 * @module core/helpers
 */

const ecies = require('ecies-lite');


/**
 * Encrypts a given {input} using a {public key}. Underneath it is using ECDH algorithm with secp256k1 curve and
 * aes-256-cbc as a cipher algorithm.
 * @param {string} public_key - key to be used to encrypt the {input}
 * @param {string} input - data to be encrypted
 * @returns {string}
 */
exports.encrypt = function (public_key, input) {
    let encryption_body = ecies.encrypt(Buffer.from(public_key, 'hex'), Buffer.from(input));
    return Buffer.from(JSON.stringify(encryption_body)).toString('base64');
};


/**
 * Decrypts data encrypted by the {@link module:core/helpers/encrypt} using provided private key
 * @param {string} private_key - private key matching the public key used in the encryption process
 * @param {string} encoded_encryption_output - data to be decrypted
 * @returns {string}
 */
exports.decrypt = function (private_key, encoded_encryption_output) {
    let ascii_body = Buffer.from(encoded_encryption_output, 'base64').toString('ascii');
    let encryption_body = JSON.parse(ascii_body);

    for (let prop of Object.keys(encryption_body)) {
        encryption_body[prop] = Buffer.from(encryption_body[prop].data);
    }

    return ecies.decrypt(Buffer.from(private_key, 'hex'), encryption_body).toString('utf-8');
};


/**
 * Sleeps for a specific time.
 * @param {Number} waitTimeInMs - number of  miliseconds to sleep
 * @returns {Promise}
 */
exports.sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

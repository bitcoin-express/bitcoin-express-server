"use strict";

/**
 * Common checks definitions to be used by validators.
 * It should not define property specific' checks but rather data type' specific.
 *
 * If you need to define a common validator for a property check @{module:core/models/BaseModel.VALIDATORS}
 * @module core/checks
 */

const config = require('config');
const email_parser = require('email-addresses');


/**
 * Checks if the passed parameter looks like a valid integer
 * @param number
 * @returns {boolean}
 */
exports.isInteger = number => {
    return Boolean(String(number).match(/^\d+$/));
};


/**
 * Checks if the passed parameter looks like a valid float
 * @param number
 * @returns {boolean}
 */
exports.isFloat = number => {
    return !isNaN(parseFloat(number));
};


/**
 * Checks if the passed parameter looks like a date and can be feed to {Date} to initialise a new object
 * @param date
 * @returns {boolean}
 */
exports.isDate = date => {
    return ((new Date(date).toString() !== "Invalid Date") && !isNaN(new Date(date)));
};


/**
 * Checks if the passed parameter looks like a valid domain name. By default it feed the parameter to the {URL} to check
 * if it can be parsed but also it check for dots in the name to exclude more exotic (but acceptable by the {URL}
 * domains' forms.
 * @param domain
 * @returns {boolean}
 */
exports.isDomain = domain => {
    try {
        // As URL requires schema we have to add it to the passed name...
        let url = new URL('http://' + domain);

        // ...making sure that domain is a "standard" domain name, with at least one dot inside...
        if (url.hostname !== domain || domain.startsWith('.') || domain.endsWith('.') || !domain.includes('.')) { throw new Error('Invalid domain format'); }

        // ...and adding length restrictions that suits our needs.
        if (domain.length < 4 || domain.length > 128) { throw new Error('Invalid domain length'); }
    }
    catch (e) {
        return false;
    }

    return true;
};


/**
 * Checks if the passed parameter looks like a valid URL.
 * @param url
 * @returns {boolean}
 */
exports.isURL = url => {
    try {
        let parsed_url = new URL(url);
        if (!parsed_url) { throw new Error('Invalid URL format'); }
    }
    catch (e) {
        return false;
    }

    return true;
};


/**
 * Checks if the passed parameter looks like a valid email address.
 * @param email
 * @returns {boolean}
 */
exports.isEmail = email => {
    try {
        if (!email_parser.parseOneAddress(email)) { throw new Error('Invalid email format'); }

        // Length restrictions that suits our needs
        if (email.length < 5 || email.length > 256) { throw new Error('Invalid email length'); }
    }
    catch (e) {
        return false;
    }

    return true;
};

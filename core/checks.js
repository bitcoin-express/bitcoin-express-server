"use strict";

const config = require('config');
const email_parser = require('email-addresses');

exports.isInteger = number => {
    return !isNaN(parseInt(number));
};

exports.isFloat = number => {
    return !isNaN(parseFloat(number));
};

exports.isDate = date => {
    return ((new Date(date).toString() !== "Invalid Date") && !isNaN(new Date(date)));
};

exports.isDomain = domain => {
    try {
        let url = new URL('http://' + domain);
        if (url.hostname !== domain || domain.startsWith('.') || domain.endsWith('.') || !domain.includes('.')) { throw new Error('Invalid domain format'); }
        if (domain.length < 4 || domain.length > 128) { throw new Error('Invalid domain length'); }
    }
    catch (e) {
        return false;
    }
    return true;
};

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

exports.isEmail = email => {
    try {
        if (!email_parser.parseOneAddress(email)) { throw new Error('Invalid email format'); }
        if (email.length < 3 || email.length > 256) { throw new Error('Invalid email length'); }
    }
    catch (e) {
        console.log(e);
        return false;
    }
    return true;
};

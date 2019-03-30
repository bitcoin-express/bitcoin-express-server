"use strict";

/**
 * Definition of middlewares to be used by Express
 * @module core/middlewares
 * @link module:core/api
 */


/**
 * CORS middleware - opens our API to be called from any domain/host and not only from our own.
 * @param {object} req - The Express' request object
 * @param {object} res - The Express' response object
 * @param {function} next - function to be called to proceed with the Express' chain of execution
 */
exports.corsMiddleware = function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, BE-MG-Auth-Token");
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header("Access-Control-Max-Age", "86400");

    if (req.method === 'OPTIONS') { res.send(200); }
    else { next(); }
};

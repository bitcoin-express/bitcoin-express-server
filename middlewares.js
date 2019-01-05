const db = require('./db');
const config = require('config');
const { Account } = require(config.get('system.root_dir') + '/core/models/Account');

function sanitiseRequest(req) {
    if (req.body) {
        delete req.body._id;
        delete req.body.account_id;
        delete req.body.account;
        delete req.body.auth;
    }

    if (req.query) {
        delete req.query._id;
        delete req.query.account_id;
        delete req.query.account;
    }

    return req;
}


// Authentication is required, check auth token
exports.requireAuthentication = async function (req, res, next) {
    // If authentication header is not passed - quit
    if (!req.headers["be-mg-auth-token"]) {
        return res.sendStatus(401);
    }

    // Make sure that request is clear from tampering and/or mistakenly passed keys that are not allowed to be set via API
    req = sanitiseRequest(req);

    try {
        // Try to find account authenticated by the passed token
        // let account = await db.findOne('accounts', { auth_token: req.headers["be-mg-auth-token"], });
        let account = await Account.find(req.headers["be-mg-auth-token"]);

        req.params._account_id = account.account_id;
        req.params._account = account;

        return next();
    }
    catch {
        // In case the account is not found or something went wrong - quit
        return res.status(401).send("No account with this auth token");
    }
};

// No authentication needed - just move forward
exports.noAuthentication = function (req, res, next) {
  return next();
};

exports.corsMiddleware = function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, BE-MG-Auth-Token");

  next();
};

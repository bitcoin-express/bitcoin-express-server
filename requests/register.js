const crypto = require('crypto');
const os = require('os');
const config = require('config');

var db = require('../db');



function registerAccount(req) {
  var {
    domain,
    email,
    name,
  } = req.body;
  console.log(req.body)

  if (!domain) {
    return Promise.reject(new Error("Missing domain value"));
  }
  var diffHell = crypto.createDiffieHellman(60);
  diffHell.generateKeys();

  var data = {
    "authToken": diffHell.getPublicKey('hex'),
    "privateKey": diffHell.getPrivateKey('hex'),
    "domain": domain,
    "serverDomain": config.get('account.server_domain'),
    "homeIssuer": config.get('account.home_issuer'),
    "acceptableIssuers": config.get('account.acceptable_issuers'),
    "default_payment_timeout": config.get('account.default_payment_timeout'),
    "default_payment_currency": config.get('account.default_payment_currency'),
    "paymentPath": config.get('account.payment_path'),
  }

  // TODO: check if this shouldn't be email_customer_contact. If yes, then remove email_account_contact altogether and
  // update API key as well
  // TODO: check why we are setting this two keys to false
  if (email) {
    data["email_account_contact"] = email;
    data["provide_receipt_via_email"] = false;
    data["provide_refund_via_email"] = false;
  }

  if (name) {
    data["name"] = name;
  }

  console.log(data);
  return db.insert("accounts", data).then((records) => {
    delete data.privateKey;
    delete data._id;
    return data;
  });
};

exports.registerAccount = registerAccount

exports.register = function (req, res) {
  registerAccount(req).then((resp) => {
    res.send(JSON.stringify(resp));
  }).catch((err) => {
    res.status(400).send(err.message || err);
  });
};


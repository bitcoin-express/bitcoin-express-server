const crypto = require('crypto');
const os = require('os');
const config = require('config');

var db = require('../db');



function registerAccount(req) {
    //TODO: change it to JSON
    //TODO: add checks for fields
    var {
        domain,
        email_account_contact,
        email_customer_contact,
        name,
    } = req.body;
    console.log(req.body);


  // Check if all passed keys are allowed
  for (let key of Object.keys(req.body)) {
    if (!config.get('_register_allowed_keys').includes(key)) {
        return Promise.reject(new Error(`Unknown key name: ${key}`));
    }
  }

  // Check if all required keys are passed
  let missing_required_keys = [];
  for (let required_key of config.get('_register_required_keys')) {
    if (!req.body.hasOwnProperty(required_key)) {
      missing_required_keys.push(required_key);
    }
  }

  if (missing_required_keys.length > 0) {
      return Promise.reject(new Error(`Missing required keys: ${missing_required_keys.join(', ')}`));
  }

  var diffHell = crypto.createDiffieHellman(60);
  diffHell.generateKeys();

  var data = {
    "authToken": diffHell.getPublicKey('hex'),
    "privateKey": diffHell.getPrivateKey('hex'),
    "domain": domain,
    "serverDomain": config.get('account.server_domain'),
    "home_issuer": config.get('account.home_issuer'),
    "acceptable_issuers": config.get('account.acceptable_issuers'),
    "default_payment_timeout": config.get('account.default_payment_timeout'),
    "default_payment_currency": config.get('account.default_payment_currency'),
    "paymentPath": config.get('account.payment_path'),
  }

  // TODO: check if this shouldn't be email_customer_contact. If yes, then remove email_account_contact altogether and
  // update API key as well
  // TODO: to consider - allow to set other options like refund etc. during registration
  if (email_customer_contact) {
    data["email_customer_contact"] = email_customer_contact;
    data["provide_receipt_via_email"] = config.get('account.provide_receipt_via_email');
    data["provide_refund_via_email"] = config.get('account.provide_refund_via_email');
  }

  if (email_account_contact) {
    data["email_account_contact"] = email_account_contact;
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


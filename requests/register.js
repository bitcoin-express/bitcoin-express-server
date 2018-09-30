var crypto = require('crypto');
var os = require('os');

var db = require('../db');
var config = require("../config.json");

exports.registerAccount = function (req) {
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
    "serverDomain": config.serverDomain,
    "homeIssuer": config.homeIssuer,
    "acceptableIssuers": config.acceptableIssuers,
    "dbConnection": config.dbConnection,
    "defaultTimeout": 3600,
    "defaultCurrency": config.defaultCurrency,
    "paymentPath": config.paymentPath,
  }

  if (email) {
    data["emailAccountContact"] = email;
    data["offerEmailReceipt"] = false;
    data["offerEmailRefund"] = false;
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

exports.register = function (req, res) {
  this.registerAccount(req).then((resp) => {
    res.send(JSON.stringify(resp));
  }).catch((err) => {
    res.status(400).send(err.message || err);
  });
};

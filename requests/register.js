var crypto = require('crypto');
var os = require('os');

var db = require('../db');
var config = require("../config.json");

exports.register = function (req, res) {
  var {
    domain,
    email,
    name,
  } = req.body;
  console.log(req.body)

  if (!domain) {
    res.status(400).send("Missing domain value");
    return;
  }
  var diffHell = crypto.createDiffieHellman(60);
  diffHell.generateKeys();

  var data = {
    "authToken": diffHell.getPublicKey('base64'),
    "privateKey": diffHell.getPrivateKey('base64'),
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
    data["emailCustomerContact"] = email;
    data["emailAccountContact"] = email;
    data["offerEmailReceipt"] = false;
    data["offerEmailRefund"] = false;
  }

  if (name) {
    data["name"] = name;
  }

  console.log(data);
  db.insert("accounts", data).then((records) => {
    delete data.privateKey;
    delete data._id;
    res.send(JSON.stringify(data));
  }).catch((err) => {
    res.status(400).send(err.message || err);
    return;
  });
}

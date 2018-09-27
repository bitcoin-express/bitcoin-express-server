var db = require('../db');
var issuer = require('../issuer');
var utils = require('../issuer/utils');
var config = require("../config.json");

exports.setConfig = function (req, res) {
  var query = { "_id": req.body.account_id };

  var data = Object.assign({}, req.body);
  delete data.account_id;
  delete data.account;

  // Improve request by checking values and 
  // throwing exceptions when settings values are
  // not right
  db.findAndModify("accounts", query, data).then((result) => {
    if (!result) {
      res.status(400).send("Not modified, account not found");
      return;
    }
    res.send(JSON.stringify(result));
  }).catch((err) => {
    res.status(400).send(err.message || err);
    return;
  });
};

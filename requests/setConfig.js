var db = require('../db');

const { ObjectId } = require('mongodb');

function getSettings(account_id) {
  if (!account_id) {
    return Promise.reject(new Error("Missing account id"));
  }

  if (typeof account_id == "string") {
    account_id = ObjectId(account_id);
  }
  var query = { "_id": account_id };

  return db.findOne("accounts", query, true);
};

exports.getSettings = getSettings;
exports.setConfig = function (req, res) {
  var data = Object.assign({}, req.body);
  delete data.account_id;
  delete data.account;

  if (Object.keys(data).length === 0) {
    return getSettings(req.body.account_id).then((result) => {
      if (!result) {
        res.status(400).send("Account not found");
        return;
      }
      res.send(JSON.stringify(result));
    }).catch((err) => {
      res.status(400).send(err.message || err);
      return;
    });
  }

  // Improve request by checking values and 
  // throwing exceptions when settings values are
  // not right
  var query = { "_id": req.body.account_id };
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

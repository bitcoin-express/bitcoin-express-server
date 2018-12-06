const config = require('config');
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

  return db.findOne("accounts", query, true).then((resp) => {
    // Before returning config values remove all keys that are configured as hidden
    let hidden_settings = config.get('_account_hidden_keys');
    if (hidden_settings.length > 0) {
        for (let key of Object.keys(resp)) {
            if (hidden_settings.includes(key)) {
                delete resp[key];
            }
        }
    }

    return resp;
  });
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



  // TODO: Improve request by checking values and
  // throwing exceptions when settings values are
  // not right


  // Check if all provided keys are correct and can be set
  let allowed_settings = config.get('account');
  for (let key of Object.keys(data)) {
      if (!allowed_settings.hasOwnProperty(key)) {
          return res.status(422).send("At least one set key is unknown");
      }
  }

  // Before returning config values remove all keys that are configured as readonly
  let readonly_settings = config.get('_account_readonly_keys');
  if (readonly_settings.length > 0) {
      for (let key of Object.keys(data)) {
          if (readonly_settings.includes(key)) {
              return res.status(403).send("Can not modify readonly setting");
          }
      }
  }

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

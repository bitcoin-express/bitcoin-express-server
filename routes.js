var db = require('./db');
var url = require('url');
const { ObjectId } = require('mongodb');

var { registerAccount } = require("./requests/register");
var { findTransactions } = require("./requests/getTransactions");
var { getSettings } = require("./requests/setConfig");
var { getListBalances } = require("./requests/getBalance");

function displayHome(res, account_id, account) {
  var promises = [
    getSettings(account_id).then((setts) => {
      var result = new Array();
      for (var key in setts) {
        result.push({
          key: key,
          value: setts[key]
        });
      }
      return result;
    }),
    findTransactions(account_id, { order: 'descending' }),
    getListBalances(account_id)
  ];

  Promise.all(promises).then((responses) => {
    var coins = [];
    if (responses[2] && responses[2].length > 0) {
      coins = responses[2];
    }

    var data = {
      transactions: responses[1],
      settings: responses[0],
      accountName: account.name || "unnamed",
      accountId: account_id,
      coins: coins
    };
    res.render('home', data);
  }).catch((err) => {
    console.log(err);
    res.render('index', { error: err.message });
  });
}

exports.panelRoute = function(req, res, next) {
  switch(url.parse(req.url).pathname) {
    case "/panel/register":
      res.render('register');
      break;

    case "/panel/confirmRegistration":
      registerAccount(req).then((resp) => {
        res.render('confirmRegistration', resp);
      }).catch((err) => {
        res.status(400).send(err.message || err);
      });
      break;

    case "/panel/logout":
      req.session.destroy();
      res.render('index');
      break;

    case "/panel/setConfig":
      var {
        account_id,
        account,
      } = req.session;
      console.log(account_id);
      var query = { "_id": ObjectId(account_id) };
      db.findOneAndModify("accounts", query, req.query);

    case "/panel/home":
      var {
        account_id,
        account,
      } = req.session;

      if (account_id && account) {
        displayHome(res, account_id, account);
        return;
      }

      if (!req.params.auth_token) {
        res.render('index', { error: 'no auth_token provided' });
        return;
      }

      var query = { auth_token: req.params.auth_token };
      db.findOne("accounts", query).then((resp) => { 
        if (!resp) {
          res.render('index', { error: 'incorrect auth_token' });
          return;
        }

        var id = resp._id;
        delete resp.private_key;
        delete resp.auth_token;
        delete resp.account_id;
        delete resp._id;
        req.session.account_id = id;
        req.session.account = resp;

        displayHome(res, id, resp);
      }).catch((err) => {
        console.log("Error on login ", err.message);
        res.render('index', { error: "incorrect auth_token" });
      });
      break;

    default:
      res.status(400).send("Not found");
  }
}

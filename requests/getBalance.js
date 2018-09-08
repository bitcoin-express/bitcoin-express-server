var db = require('../db');
var utils = require('../issuer/utils');

exports.getBalance = function (req, res) {
  var {
    account_id,
    currency,
  } = req.query;

  db.getCoinList(currency, account_id).then((coins) => {
    var response = [];
    if (Object.keys(coins).length == 0) {
      if (currency) {
        res.send("{}");
        return;
      }
      res.send("[]");
      return;
    }

    Object.keys(coins).forEach((curr) => {
      var obj = {
        currency: curr,
        total: utils.coinsValue(coins[curr]),
        numCoins: coins[curr].length
      }
      response.push(obj);
    });

    if (currency) {
      // Only one currency
      response = response[0];
    }

    res.send(JSON.stringify(response));
  }).catch((err) => {
    throw err;
    res.status(400).send(err.message || err);
    return;
  });
}

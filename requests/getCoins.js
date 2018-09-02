var db = require('../db');
var issuer = require('../issuer');

exports.getCoins = function (req, res) {
  // TO_DO
  var {
    amount,
    currency,
    password,
    memo,
  } = req.body;

  db.getCoinList(currency).then((coins) => {
    var response = [];

    Object.keys(coins).forEach((curr) => {
      var obj = {
        currency: currency,
        total: issuer.coinsValue(coins[currency]),
        numCoins: coins[currency].length
      };
      response.push(obj);
    });

    if (currency) {
      // Only one currency
      response = response[0];
      delete response.currency;
    }

    res.send(JSON.stringify(response));
  }).catch((err) => {
    throw err;
    res.status(400).send(err.message || err);
    return;
  });
}

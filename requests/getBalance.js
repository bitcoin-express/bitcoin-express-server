var db = require('../db');
var issuer = require('../issuer');

exports.getBalance = function (req, res) {
  var currency = req.query.currency;

  db.getCoinList(currency).then((coins) => {
    var response = [];

    Object.keys(coins).forEach((curr) => {
      var obj = {
        currency: curr,
        total: issuer.coinsValue(coins[curr]),
        numCoins: coins[curr].length
      }
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

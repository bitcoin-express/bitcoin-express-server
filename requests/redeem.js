var db = require('../db');
var issuer = require('../issuer');
var utils = require('../issuer/utils');

exports.redeem = function (req, res) {
  // speed [enum:fastest,soon,noHurry,minFee]
  var {
    account_id,
    amount,
    currency,
    address,
    speed,
    message,
    label,
  } = req.body;

  if (!amount) {
    res.status(400).send("Missing amount value");
    return;
  }
  if (parseFloat(amount) <= 0) {
    res.status(400).send("Amount must be positive");
    return;
  }
  if (!currency) {
    res.status(400).send("Missing currency value");
    return;
  }
  if (!address) {
    res.status(400).send("Missing address value");
    return;
  }

  speed = speed || "fastest";

  db.getCoinList(currency, account_id).then((coins) => {
    console.log("all coins", coins);
    coins = coins[currency];

    var total = utils.coinsValue(coins);
    console.log("total ", total);
    if (total < parseFloat(amount)) {
      res.status(400).send(`Not enough funds. You have a total of ${currency} ${total}.`);
      return;
    }

    if (!coins.every((c) => currency == utils.Coin(c).c)) {
      res.status(400).send("Some coins with incorrect currency");
      return;
    }

    var uri = `bitcoin:${address}?amount=${amount}`;
    if (message) {
      uri += `&message=${encodeURIComponent(message)}`;
    }
    if (label) {
      uri += `&label=${encodeURIComponent(label)}`;
    }

    return utils.transferBitcoin(uri, coins, total, speed, account_id).then((resp) => {
      res.setHeader('Content-Type', 'application/json');
      console.log("*** BITCOIN TRANSFER COMPLETED ***");
      res.send(JSON.stringify(resp));
    }).catch((err) => {
      res.status(400).send(err.message || err);
      return;
    });
  }).catch((err) => {
    res.status(400).send(err.message || err);
    return;
  });
}

var db = require('../db');
var issuer = require('../issuer');

exports.getCoins = function (req, res) {
  var {
    amount,
    currency,
    password,
    memo,
  } = req.body;

  amount = parseFloat(amount);
  if (!amount || isNaN(amount)) {
    res.status(400).send("Incorrect amount");
    return;
  }

  if (!currency) {
    res.status(400).send("No currency included");
    return;
  }

  // TO_DO
  issuer.extractCoins(amount, currency, password).then((ref, coins, iv) => {
    var coinsOj = {
      coins: {
        [currency]: coins
      }
    };

    if (password && iv) {
      coinsObj.coins["encrypted"] = true;
      coinsObj.coins["iv"] = iv;
    }

    // TO_DO - feed sender
    var response = {
      fileType: "export",
      date: new Date().toISOString(),
      sender: req.header.domain + ":" + req.header.port,
      reference: ref,
      memo: memo || "Extracted " + currency + amount.toFixed(8),
      contents: [currency + " " + amount.toFixed(8)],
      coins: coinsObj
    };
    res.send(JSON.stringify(response));
  }).catch((err) => {
    throw err;
    res.status(400).send(err.message || err);
    return;
  });
}

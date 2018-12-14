var db = require('../db');

exports.getCoins = function (req, res) {
  var {
    account_id,
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

  var special = {
    fields: {
      _id: 0,
      account_id: 0,
    }
  };

  // TO_DO:
  // 1. Now returns all, must return the desired amount
  // 2. Change to Bitcoin-express format
  // 3. Encrypt with password
  var query = {
    account_id: account_id,
    currency: currency
  };
  db.find('coins', query, { projection: special }).then((resp) => {
    res.send(JSON.stringify(resp));
  }).catch((err) => {
    res.status(400).send(err.message || err);
    return;
  });
}

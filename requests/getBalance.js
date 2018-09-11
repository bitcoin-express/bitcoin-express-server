var https = require('https');

var db = require('../db');
var utils = require('../issuer/utils');

var FIAT = ["USD", "GBP", "EUR"];

exports.getBalance = function (req, res) {
  var {
    account_id,
    currency,
  } = req.query;

  var prom1 = Promise.resolve(null);
  var exchange;
  if (currency && FIAT.indexOf(currency) > -1) {
    prom1 = refreshRates(currency);
    exchange = currency;
    currency = undefined;
  }
  var prom2 = db.getCoinList(currency, account_id);

  Promise.all([prom1, prom2]).then(([rates, coins]) => {
    var response = [];
    var totalFiat = 0.0;

    if (Object.keys(coins).length == 0) {
      if (currency) {
        res.send("{}");
        return;
      }
      res.send("[]");
      return;
    }

    // If currency request, return only the coins value of
    // that currency
    if (currency) {
      coins = coins[currency];
    }

    Object.keys(coins).forEach((curr) => {
      var value = utils.coinsValue(coins[curr]);
      var obj = {
        currency: curr,
        total: value,
        numCoins: coins[curr].length
      }
      response.push(obj);
      if (exchange && rates) {
        var rate = parseFloat(rates[curr][exchange]);
        totalFiat += rate * parseFloat(value);
      }
    });

    if (exchange) {
      response.push({
        currency: exchange,
        total: parseFloat(totalFiat.toFixed(3)),
      });
    }

    res.send(JSON.stringify(response));
  }).catch((err) => {
    throw err;
    res.status(400).send(err.message || err);
    return;
  });
}


var RATES = {};
["XBT", "BTC", "ETH", "BCH"].forEach((k) => {
  RATES[k] = {
    time: {
      updated: null,
      updatedUK: null,
    },
    USD: null,
    GBP: null,
    EUR: null
  };
});

function getJSONOptions(currency) {
  // currency can be "EUR" or "GBP"
  return {
    host: 'api.coinmarketcap.com',
    port: 443,
    method: 'GET',
    path: `/v1/ticker/?convert=${currency}`,
    headers: {
      'Content-Type': 'application/json',
      'accept': '*/*',
    },
  };
}

function updateRates(response, curr) {
  const keys = ["bitcoin", "bitcoin-cash", "ethereum"];
  const now = new Date();

  response = response.filter((c) => {
    return keys.indexOf(c.id) > -1;
  });

  if (curr == "GBP") {
    response.forEach((currency) => {
      switch(currency.id) {
        case "bitcoin":
          RATES.BTC.GBP = parseFloat(currency["price_gbp"]);
          RATES.XBT.GBP = parseFloat(currency["price_gbp"]);
          RATES.BTC.time.updatedUK = now;
          RATES.XBT.time.updatedUK = now;
          break;

        case "bitcoin-cash":
          RATES.BCH.GBP = parseFloat(currency["price_gbp"]);
          RATES.BCH.time.updatedUK = now;
          break;

        case "ethereum":
          RATES.ETH.GBP = parseFloat(currency["price_gbp"]);
          RATES.ETH.time.updatedUK = now;
          break;
      }
    });
    return RATES;
  }
  
  response.forEach((currency) => {
    switch(currency.id) {
      case "bitcoin":
        RATES.BTC.EUR = parseFloat(currency["price_eur"]);
        RATES.BTC.USD = parseFloat(currency["price_usd"]);
        RATES.XBT.EUR = parseFloat(currency["price_eur"]);
        RATES.XBT.USD = parseFloat(currency["price_usd"]);
        RATES.BTC.time.updated = now;
        RATES.XBT.time.updated = now;
        break;

      case "bitcoin-cash":
        RATES.BCH.EUR = parseFloat(currency["price_eur"]);
        RATES.BCH.USD = parseFloat(currency["price_usd"]);
        RATES.BCH.time.updated = now;
        break;

      case "ethereum":
        RATES.ETH.EUR = parseFloat(currency["price_eur"]);
        RATES.ETH.USD = parseFloat(currency["price_usd"]);
        RATES.ETH.time.updated = now;
        break;
    }
  });
  return RATES;
}

function refreshRates(currency) {
  return new Promise((resolve, reject) => {
    var options = getJSONOptions(currency);
    var req = https.request(options, (resp) => {
      var rawData = '';
      resp.on('data', function(chunk) {
        rawData += chunk;
      });
      resp.on('end', function() {
        try {
          resolve(updateRates(JSON.parse(rawData), currency));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", function(e) {
      reject(e);
    });
    req.end();
  });
}


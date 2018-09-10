var https = require('https');
var { coinSelection } = require('./issuer/coinSelection')
var db = require('./db');

// Set issuer data for payment coins verification
var options = {
  host: 'be.ap.rmp.net',
  port: 443,
  headers: {
    'Content-Type': 'application/json',
    'accept': '*/*'
  },
};

exports.get = function (endpoint, host=null) {
  options.host = host || options.host;
  options.method = 'GET';
  options.path = `/Bitcoin-express/v1/issuer/${endpoint}`;
  return issuerRequest(options, endpoint);
}

exports.post = function (endpoint, data, host=null) {
  options.host = host || options.host;
  options.method = 'POST';
  options.path = `/Bitcoin-express/v1/issuer/${endpoint}`;
  options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
  return issuerRequest(options, endpoint, data);
}

exports.transfer = function (uri, amount, db, speed) {
  return utils.transferBitcoin(uri, amount, db, speed);
}

function issuerRequest(options, endpoint, data=null) {
  return new Promise((resolve, reject) => {
    var req = https.request(options, (resp) => {
      var rawData = '';
      resp.on('data', function(chunk) {
        rawData += chunk;
      });
      resp.on('end', function() {
        try {
          resolve(JSON.parse(rawData));
          return;
        } catch (e) {
          reject(e);
          return;
        }
      });
    });

    req.on("error", function(e) {
      reject(e);
      return;
    });

    req.write(JSON.stringify(data));
    req.end();
  });
}

exports.extractCoins = function (amount, currency, pwd) {
  return 0;
/*
  console.log(typeof this.post);
  return db.extractCoins().then((coins) => {
    coins = coins[currency];
    console.log(coins);
    if (this.coinsValue(coins) < amount) {
      throw new Error("Not enough funds");
      return;
    }
    var finalCoins = coinSelection(amount, coins);
    if (pwd) {
      // TO_DO, encrypt coins here
      console.log(coins)
    }
    // TO_DO, remove coins from db
    // ...
    return finalCoins;
  });
  */
};

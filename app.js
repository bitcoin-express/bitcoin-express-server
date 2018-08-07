var bodyParser = require('body-parser');
var express = require('express');
var fs = require('fs');
var https = require('https');
var ObjectId = require('mongodb').ObjectId;


var db = require('./db');
var issuer = require('./issuer');
var utils = require('./issuer/utils');

var privateKey  = fs.readFileSync('./sslcert/bitcoinexpress.key', 'utf8');
var certificate = fs.readFileSync('./sslcert/bitcoinexpress.crt', 'utf8');


var app = express();
var credentials = {
  key: privateKey,
  cert: certificate,
  passphrase: 'bitcoinexpress'
};


app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});


Date.prototype.addMinutes = function (m) {
  this.setMinutes(this.getMinutes() + m);
  return this;
}


// Connect to Mongo on start
db.connect('mongodb://localhost:27017/', function (err) {

  if (err) {
    console.log('Unable to connect to MongoDB.')
    process.exit(1)
    return;
  }

  // GET - https://localhost:8443
  app.get('/', index);
  // POST - https://localhost:8443/createPaymentRequest
  app.post('/createPaymentRequest', createPaymentRequest);
  // GET - https://localhost:8443/getBalance
  app.get('/getBalance', getBalance);
  // GET - https://localhost:8443/getPaymentStatus?merchant_data=XXXXXXX
  app.get('/getPaymentStatus', getPaymentStatus);
  // GET - https://localhost:8443/getTransactions
  app.get('/getTransactions', getTransactions);
  // POST - https://localhost:8443/payment
  app.post('/payment', payment);
  // POST - https://localhost:8443/redeem
  app.post('/redeem', redeem);

  var httpsServer = https.createServer(credentials, app);
  httpsServer.listen(8443, function() {
    console.log('Listening on port 8443...');
  });

  /********************
   * API functions
   ********************/

  function index (req, res) {
    res.send('Hello Bitcoin-Express wallet merchant!');
  }

  /* Example of a payment request body:
   * {
   *   "amount": 0.0000095,
   *   "payment_url": "https://localhost:8443/payment",
   *   "currency": "XBT",
   *   "issuers": ["be.ap.rmp.net","eu.carrotpay.com"],
   *   "memo": "The art of asking",
   *   "return_url": "http://amandapalmer.net/hero_mask.png",
   *   "return_memo":"Thank you for buying this image",
   *   "email": {
   *     "contact":"sales@merchant.com",
   *     "receipt":true,"refund":false
   *   }
   * }
   */
  function createPaymentRequest(req, res) {
    var paymentRequest = req.body;

    if (!paymentRequest.amount || isNaN(paymentRequest.amount)) {
      res.status(400).send("Incorrect amount");
      return;
    }

    if (!paymentRequest.payment_url) {
      res.status(400).send("No payment_url included");
      return;
    }

    if (!paymentRequest.return_url) {
      res.status(400).send("No return_url included");
      return;
    }

    if (!paymentRequest.memo) {
      res.status(400).send("No memo included");
      return;
    }

    if (!paymentRequest.currency) {
      res.status(400).send("Missing currency");
      return;
    }

    // Payment expires in 4 minutes
    var now = new Date();
    paymentRequest.expires = paymentRequest.expires || now.addMinutes(4).toISOString();
    paymentRequest.language_preference = paymentRequest.language_preference || "English";
    paymentRequest.issuers = paymentRequest.issuers || ["*"];
    paymentRequest.resolved = false;
    paymentRequest.time = now.toISOString();

    db.insert("payments", paymentRequest).then((records) => {
      paymentRequest.merchant_data = records.insertedIds['0'];

      // Delete not usefult params
      delete paymentRequest.resolved;
      delete paymentRequest._id;
      // Of course, remove the memo and return_url
      // It will be used in the future once the payment is verified
      delete paymentRequest.return_url;
      delete paymentRequest.return_memo;

      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(paymentRequest));
    }).catch((err) => {
      res.status(400).send(err.message || err);
      return;
    });
  }

  function getPaymentStatus (req, res) {
    var merchant_data = req.query.merchant_data;
    var query = { '_id': ObjectId(merchant_data) };

    db.findOne('payments', query).then((resp) => {
      if (!resp) {
        res.status(400).send("Missing merchant_data query parameter")
      }

      if (!resp.resolved) {
        // Remove the memo and return_url if not resolved
        // This can be done by the merchant, but better to make
        // sure we do it here
        delete resp.return_url;
        delete resp.return_memo;
      }

      res.send(JSON.stringify(resp));
    }).catch((err) => {
      res.status(400).send(err.message || err);
      return;
    });
  }

  function getBalance (req, res) {
    db.getCoinList().then((coins) => {
      res.send(JSON.stringify({ total: issuer.coinsValue(coins) }));
    }).catch((err) => {
      throw err;
      res.status(400).send(err.message || err);
      return;
    });
  }

  function getTransactions (req, res) {
    var query = {};
    db.find('payments', query).then((resp) => {
      console.log(resp);
      resp = resp.map((tx) => {
        if (!tx.resolved) {
          // Remove the memo and return_url if not resolved
          // This can be done by the merchant, but better to make
          // sure we do it here
          delete tx.return_url;
          delete tx.return_memo;
        }
        return tx;
      });
      res.send(JSON.stringify({ result: resp }));
    }).catch((err) => {
      res.status(400).send(err.message || err);
      return;
    });
  }

  function redeem (req, res) {
    var uri = req.body.address;
    var speed = req.body.speed;
    return issuer.transfer(uri, db, speed).then((resp) => {
      res.setHeader('Content-Type', 'application/json');
      console.log("*** BITCOIN TRANSFER COMPLETED ***");
      res.send(JSON.stringify(resp));
    }).catch((err) => {
      res.status(400).send(err.message || err);
      return;
    });
  }

  function payment (req, res) {
    var payment = req.body.Payment;
    var {
      coins,
      id,
      language_preference,
      merchant_data,
    } = payment;

    // Not used for this demo, needs to be implemented
    // var receipt_to = payment.receipt_to;
    // var refund_to = payment.refund_to;
    // var client = payment.client;

    if (!id) {
      res.status(400).send("Missing id");
      return;
    }

    if (!merchant_data) {
      res.status(400).send("Missing merchant_data");
      return;
    }

    if (!coins || coins.length == 0) {
      res.status(400).send("No coins included");
      return;
    }

    var expires, key, tid, verifiedCoins, amount,
      currency, return_url, memo = null;

    var query = { '_id': ObjectId(merchant_data) };

    db.findOne('payments', query).then((resp) => {
      if (!resp) {
        throw new Error("Can not find payment with merchant_data " + merchant_data);
      }

      return_url = resp.return_url;
      memo = resp.return_memo;

      if (resp.resolved) {
        // The payment is resolved, throw error and intercept it
        var response = {
          PaymentAck: {
            status: "ok",
            id: id,
            return_url: return_url, // this should be feeded by the merchant
            memo: memo
          }
        };

        res.setHeader('Content-Type', 'application/json');
        console.log("*** PAYMENT COMPLETED AND CORRECT ***");
        res.send(JSON.stringify(response));
        throw new Error("-1");
      }

      amount = resp.amount;
      currency = resp.currency;
      expires = resp.expires;

      if (issuer.coinsValue(coins) < amount) {
        throw new Error("The coins sended are not enough");
      }

      if (!coins.every((c) => currency == utils.Coin(c).c)) {
        throw new Error("Some coins are not from the requested currecy");
      }

      var { issuers } = resp;
      var inIssuerList = (c) => issuers.indexOf(utils.Coin(c).d) > -1;
      if (issuers.length == 0) {
        throw new Error("Empty issuer list");
      }
      if (issuers[0] != "*" && !coins.every(inIssuerList)) {
        throw new Error("Some coins are not from the requested currecy");
      }

      return issuer.post('begin', {
        issuerRequest: {
          fn: "verify"
        }
      });
    }).then((resp) => {
      tid = resp.issuerResponse.headerInfo.tid;
      var payload = {
        issuerRequest: {
          tid: tid,
          expiry: expires,
          coin: coins,
          targetValue: String(amount),
          issuePolicy: "single"
        }
      };
      console.log("coins to verify ", coins);
      return issuer.post('verify', payload);
    }).then((resp) => {
      verifiedCoins = resp.issuerResponse.coin;
      console.log("verified coins ", verifiedCoins);

      if (issuer.coinsValue(verifiedCoins) < amount) {
        throw new Error("After verify coins, the amount is not enough");
      }

      // Coins verified, save them in DB
      return db.insert("coins", {
        coins: verifiedCoins,
        currency: currency,
        date: new Date().toISOString()
      });
    }).then((records) => {
      return db.findAndModify("payments", query, {
        resolved: true,
        id: id
      });
    }).then((doc) => {
      key = doc.value.key;
      return issuer.post('end', {
        issuerRequest: {
          tid: tid
        }
      });
    }).then((resp) => {
      var response = {
        PaymentAck: {
          status: "ok",
          id: id,
          memo: memo,
          return_url: return_url
        }
      };
      res.setHeader('Content-Type', 'application/json');
      console.log("*** PAYMENT COMPLETED AND CORRECT ***");
      res.send(JSON.stringify(response));
    }).catch((err) => {
      if (err.message == "-1") {
        return;
      }
      res.status(400).send(err.message || err);
      return;
    });
  }
})

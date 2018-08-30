var bodyParser = require('body-parser');
var express = require('express');
var fs = require('fs');
var https = require('https');
var uuidv1 = require('uuid/v1');
var ObjectId = require('mongodb').ObjectId;


var db = require('./db');
var issuer = require('./issuer');
var utils = require('./issuer/utils');

var config = require("./config.json");


var authentication = config.authentication;
var paymentPath = config.paymentPath || '/pay';

var defCurrency = config.defaultCurrency;
var defTimeout = config.defaultTimeout;
var defIssuers = config.acceptableIssuers || [config.homeIssuer];
var defEmail = {
  contact: config.emailContact,
  receipt: config.offerEmailRecipt,
  refund: config.offerEmailRefund
};

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

if (authentication && authentication.length > 0) {
  var myLogger = function (req, res, next) {
    var auth;
    if (req.method == "GET") {
      auth = req.query.authentication;
    }
    if (req.method == "POST") {
      auth = req.body.authentication;
      delete req.body.authentication;
    }
    if (!auth || authentication != auth) {
      res.status(400).send("Incorrect authentication");
      return;
    }
    next();
  } 
  app.use(myLogger);
}

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});


Date.prototype.addSeconds = function (s) {
  this.setSeconds(this.getSeconds() + s);
  return this;
}

// Connect to Mongo on start
db.connect(config.dbConnection, function (err) {

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
  // GET - https://localhost:8443/getPaymentStatus?payment_id=XXXXXXX
  app.get('/getPaymentStatus', getPaymentStatus);
  // GET - https://localhost:8443/getTransactions
  app.get('/getTransactions', getTransactions);
  // POST - https://localhost:8443/payment
  app.post('/payment', payment);
  // POST - https://localhost:8443/redeem
  app.get('/redeem', redeem);

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
   *   amount: 0.0000095,
   *   return_url: "http://amko55andapalmer.net/wp-content/themes/afp/art-of-asking/images/hero_mask.png",
   *   memo: "The art of asking",
   *   authentication: pwd,
   * }
   */
  function createPaymentRequest(req, res) {
    var paymentRequest = req.body;
    console.log(req.body);

    if (!paymentRequest.amount || isNaN(paymentRequest.amount)) {
      res.status(400).send("Incorrect amount");
      return;
    }

    if (!paymentRequest.memo) {
      res.status(400).send("No memo included");
      return;
    }

    if (!paymentRequest.return_url) {
      res.status(400).send("No return_url included");
      return;
    }

    // Build the 
    paymentRequest.payment_url = req.protocol + '://' + req.get('host') + paymentPath
    paymentRequest.currency = paymentRequest.currency || defCurrency;
    paymentRequest.email = paymentRequest.email || defEmail;

    if (!paymentRequest.currency) {
      res.status(400).send("Missing currency");
      return;
    }

    // Payment expires in 4 minutes
    var now = new Date();
    paymentRequest.payment_id = uuidv1();
    console.log("payment_id created - ", paymentRequest.payment_id)
    paymentRequest.expires = paymentRequest.expires || now.addSeconds(defTimeout).toISOString();
    paymentRequest.issuers = paymentRequest.issuers || defIssuers;

    var data = Object.assign({
      resolved: false,
      time: now.toISOString()
    }, paymentRequest);

    db.insert("payments", data).then((records) => {
      // records.insertedIds['0'];
      delete paymentRequest.return_url;
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(paymentRequest));
    }).catch((err) => {
      res.status(400).send(err.message || err);
      return;
    });
  }

  function getPaymentStatus (req, res) {
    var field = req.query.queryField;
    var data = req.query.queryData;

    if (['payment_id', 'merchant_data'].indexOf(field) == -1) {
      res.status(400).send("Wrong queryField")
    }

    var query = { [field]: data };
    db.findOne('payments', query).then((resp) => {
      if (!resp) {
        res.status(400).send("Payment not found by " + field + " query parameter")
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
    /*
    var uri = req.body.address;
    var speed = req.body.speed;
    var amount = req.body.amount;
    var message = req.body.message;
    */
    var address = "35hQUijzi3QnwxCbmXpLqN4hyqGV2hgot5";
    var speed = "fastest";
    var amount = 0.000003;
    var message = "test";
    var label = "jose";
    var uri = `bitcoin:${address}?amount=${amount}&message=${message}&label=${label}`;

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
    var {
      coins,
      payment_id,
      return_memo,
    } = req.body;

    console.log("payment_id recieved - ", payment_id)

    // Not used for this demo, needs to be implemented
    // var receipt_to = req.body.receipt_to;
    // var refund_to = req.body.refund_to;
    // var client = req.body.client;

    if (!payment_id) {
      res.status(400).send("Missing payment_id");
      return;
    }

    if (!coins || coins.length == 0) {
      res.status(400).send("No coins included");
      return;
    }

    var expires, key, tid, verifiedCoins, amount,
      currency;

    var query = { 'payment_id': payment_id };

    db.findOne('payments', query).then((resp) => {
      if (!resp) {
        throw new Error("Can not find payment with payment_id " + payment_id);
      }

      if (resp.resolved) {
        // The payment is resolved, throw error and intercept it
        var response = {
          PaymentAck: {
            status: "ok",
            id: payment_id,
            return_url: resp.return_url,
            memo: resp.return_memo
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

      // this is coming from issuer list
      var inIssuerList = (c) => defIssuers.indexOf(utils.Coin(c).d) > -1;
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

      /*
       * TO_DO - coinsValue minus expected verification fee
      if (issuer.coinsValue(verifiedCoins) < amount) {
        throw new Error("After verify coins, the amount is not enough");
      }
      */

      // Coins verified, save them in DB
      return db.insert("coins", {
        coins: verifiedCoins,
        currency: currency,
        date: new Date().toISOString()
      });
    }).then((records) => {
      return db.findAndModify("payments", query, {
        resolved: true,
        return_url,
        return_memo,
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
          id: payment_id,
          memo: return_memo,
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

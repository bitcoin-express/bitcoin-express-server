var bodyParser = require('body-parser');
var express = require('express');
var fs = require('fs');
var https = require('https');

var ObjectId = require('mongodb').ObjectId;
var db = require('./db');
var issuer = require('./issuer');

var privateKey  = fs.readFileSync('./sslcert/bitcoinexpress.key', 'utf8');
var certificate = fs.readFileSync('./sslcert/bitcoinexpress.crt', 'utf8');;

// 1. Initialiaze server with the proper keys for secure connection
var app = express();
var credentials = {
  key: privateKey,
  cert: certificate,
  passphrase: 'bitcoinexpress'
};

// 2. List of different products sold with its value.
//
// To initialize a payment with of an item the request
// must include the item key as in the query parameter
// for example:
// GET https://localhost:8443/payment?id=theartofasking
var merchantProducts = {
  "theartofasking": {
    amount: 0.0000095,
    payment_url: "https://localhost:8443/payment",
    currency: "XBT",
    issuers: ["be.ap.rmp.net", "eu.carrotpay.com"],
    memo: "The art of asking",
    email: {
      contact: "sales@merchant.com",
      receipt: true,
      refund: false
    },
  },
};

// 3. Product hidden responses (what users will get in
// return  as a 'return_url' after payment completed).
var products = {
  "theartofasking": "https://bitcoin-e.org/static/images/test/product_art_asking.jpg",
};

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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

  // i.e. GET - https://localhost:8443
  app.get('/', function (req, res) {
    res.send('Hello Bitcoin-Express merchant!');
  });

  // i.e. GET - https://localhost:8443/payment?id=theartofasking
  app.get('/payment', function (req, res) {
    var id = req.query.id;
    if (!id || Object.keys(merchantProducts).indexOf(id) == -1) {
      res.status(400).send("No product with the requested id");
      return;
    }

    // Payment expires in 4 minutes
    var now = new Date();
    var payment = Object.assign({}, merchantProducts[id], {
      "resolved": false,
      "time": now.toISOString(),
      "expires": now.addMinutes(4).toISOString(),
      "key": id,
    });

    db.insert("payments", payment).then((records) => {
      payment.merchant_data = records.insertedIds['0'];
      delete payment.key;
      delete payment.resolved;
      delete payment._id;
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(payment));
    }).catch((err) => {
      res.status(400).send(err.message || err);
      return;
    });
  });

  // i.e. POST - https://localhost:8443/payment
  app.post('/payment', function (req, res) {
    var payment = req.body.Payment;

    var id =  payment.id;
    var merchant_data = payment.merchant_data;
    var language_preference = payment.language_preference;
    var coins = payment.coins;
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

    // get payment id from DB
    var memo = "Thank you for buying this item";
    switch (language_preference) {
      case "Spanish":
        memo = "Gracias por comprar este item";
        break;
    }

    var expires, key, tid, verifiedCoins = null;
    var query = { '_id': ObjectId(merchant_data) };

    db.findOne('payments', query).then((resp) => {
      if (!resp) {
        throw new Error("Can not find payment with merchant_data " + merchant_data);
      }

      if (resp.resolved) {
        // The payment is resolved, throw error and intercept it
        var response = {
          PaymentAck: {
            status: "ok",
            id: id,
            return_url: products[resp.key],
            memo: memo
          }
        };

        res.setHeader('Content-Type', 'application/json');
        console.log("*** PAYMENT COMPLETED AND CORRECT ***");
        res.send(JSON.stringify(response));
        throw new Error("-1");
      }

      // TO_DO: value coins is the same like payment value

      expires = resp.expires;
      return issuer.post('begin', {
        "issuerRequest": {
          "fn": "verify"
        }
      });
    }).then((resp) => {
      tid = resp.issuerResponse.headerInfo.tid;
      var payload = {
        "issuerRequest": {
          "tid": tid,
          "expiry": expires,
          "coin": coins,
          "targetValue": "0",
          "issuePolicy": "single"
        }
      };
      console.log("coins to verify ", coins);
      return issuer.post('verify', payload);
    }).then((resp) => {
      verifiedCoins = resp.issuerResponse.coin;
      console.log("verified coins ", coins);

      // Coins verified, save them in DB and return the response
      return db.findAndModify("payments", query, {
        "coins": coins,
        "resolved": true,
        "id": id
      });
    }).then((doc) => {
      // Prepare response
      key = doc.value.key;

      return issuer.post('end', {
        "issuerRequest": {
          "tid": tid
        }
      });
    }).then((resp) => {
      var response = {
        PaymentAck: {
          status: "ok",
          id: id,
          return_url: products[key],
          memo: memo
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
  });

  var httpsServer = https.createServer(credentials, app);
  httpsServer.listen(8443, function() {
    console.log('Listening on port 8443...');
  });
})

var db = require('../db');
var issuer = require('../issuer');
var utils = require('../issuer/utils');

var config = require("../config.json");
var defIssuers = config.acceptableIssuers || [config.homeIssuer];

exports.payment = function (req, res) {
  var {
    coins,
    payment_id,
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

  var expires, key, tid, verifiedCoins,
    amount, currency, returnUrl, verifyInfo;

  var query = { 'payment_id': payment_id };

  db.findOne('payments', query).then((resp) => {
    if (!resp) {
      throw new Error("Can not find payment with payment_id " + payment_id);
    }

    if (resp.status == "resolved") {
      // The payment is resolved, throw error and intercept it
      var response = {
        PaymentAck: {
          status: "ok",
          id: payment_id,
          return_url: resp.return_url,
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
    returnUrl = resp.return_url;

    if (issuer.coinsValue(coins) < amount) {
      throw new Error("The coins sended are not enough");
    }

    if (!coins.every((c) => currency == utils.Coin(c).c)) {
      throw new Error("Some coins are not from the requested currecy");
    }

    // this is coming from issuer list
    var inIssuerList = (c) => defIssuers.indexOf(utils.Coin(c).d) > -1;
    if (defIssuers[0] != "*" && !coins.every(inIssuerList)) {
      throw new Error("Some coins are not from the requested currecy");
    }

    return db.findAndModify("payments", query, { status: "processing" });
  }).then((resp) => {
    return issuer.post('begin', {
      issuerRequest: {
        fn: "verify"
      }
    });
  }).then((resp) => {
    tid = resp.issuerResponse.headerInfo.tid;
    verifyInfo = resp;

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
      status: "resolved",
      verifyInfo: verifyInfo,
      paid: new Date().toISOString(),
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
        return_url: returnUrl
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

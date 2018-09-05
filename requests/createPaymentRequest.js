var uuidv1 = require('uuid/v1');

var db = require('../db');
var issuer = require('../issuer');
var config = require("../config.json");

var paymentPath = config.paymentPath || '/pay';
var defCurrency = config.defaultCurrency;
var defTimeout = config.defaultTimeout;
var defIssuers = config.acceptableIssuers || [config.homeIssuer];
var defEmail = {
  contact: config.emailContact,
  receipt: config.offerEmailRecipt,
  refund: config.offerEmailRefund
};

Date.prototype.addSeconds = function (s) {
  console.log(s);
  this.setSeconds(this.getSeconds() + s);
  return this;
}


exports.createPaymentRequest = function (req, res) {
  var paymentRequest = req.body;
  paymentRequest.amount = parseFloat(paymentRequest.amount);

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
  paymentRequest.payment_url = paymentPath
  paymentRequest.currency = paymentRequest.currency || defCurrency;
  paymentRequest.email = paymentRequest.email || defEmail;

  if (!paymentRequest.currency) {
    res.status(400).send("Missing currency");
    return;
  }

  var now = new Date();
  var exp = new Date().addSeconds(defTimeout);
  paymentRequest.expires = paymentRequest.expires || exp.toISOString();

  paymentRequest.payment_id = paymentRequest.payment_id || uuidv1();
  console.log("new payment_id saved - ", paymentRequest.payment_id);
  paymentRequest.issuers = paymentRequest.issuers || defIssuers;

  var data = Object.assign({
    status: "initial",
    time: now.toISOString()
  }, paymentRequest);

  db.insert("payments", data).then((records) => {
    // records.insertedIds['0'];
    delete paymentRequest.return_url;
    // paymentRequest.id = paymentRequest.payment_id;

    // Set status to timeout when expiring
    var secs = exp - now;
    console.log(now, paymentRequest.expires, secs);
    setTimeout(() => {
      var query = {
        payment_id: paymentRequest.payment_id
      }
      console.log("Payment expired - " + query.payment_id);
      db.findAndModify("payments", query, { status: "timeout" });

      // new timeout to remove entry in DB
      setTimeout(() => {
        db.find("payments", query).then((resp) => {
          if (resp.status == "timeout") {
            db.remove("payments", query); 
          }
        });
      }, 30 * 1000);
    }, secs);

    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(paymentRequest));
  }).catch((err) => {
    res.status(400).send(err.message || err);
    return;
  });
}

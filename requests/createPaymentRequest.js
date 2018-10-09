var uuidv1 = require('uuid/v1');

var db = require('../db');

var {
  emailContact
} = require("../config.json");

exports.createPaymentRequest = function (req, res) {
  var {
    account,
    account_id,
    merchant_data,
  } = req.body;

  var {
    acceptableIssuers,
    defaultCurrency,
    defaultTimeout,
    domain,
    homeIssuer,
    paymentPath,
    serverDomain,
  } = account;

  merchant_data = String(merchant_data);

  var now = new Date();
  var exp = new Date().addSeconds(defaultTimeout);

  var paymentRequest = Object.assign({}, req.body);
  paymentRequest.expires = paymentRequest.expires || exp.toISOString();
  paymentRequest.time = now.toISOString();

  if (domain) {
    paymentRequest.domain = domain;
  }

  delete paymentRequest.account;
  delete paymentRequest.account_id;
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

  if (emailContact && emailContact.length > 0) {
    paymentRequest.emailContact = emailContact;
  }

  var promise = Promise.resolve(false);
  if (merchant_data) {
    var query = {
      account_id: account_id,
      merchant_data: merchant_data,
    };

    promise = db.findOne('payments', query, true).then((resp) => {
      if (!resp) {
        return false;
      }
      console.log("Found payment with merchant_data " + merchant_data);

      if (resp.status == "resolved") {
        // The payment is inmutable
        res.send(JSON.stringify(resp));
        return true;
      }

      if (resp.status == "processing") {
        res.status(400).send("A payment is already in process for this request.");
        return true;
      }

      // Reset payment to initial status
      paymentRequest.status = "initial";
      return db.findAndModify("payments", query, paymentRequest).then((response) => {
        if (!response) {
          return false;
        }
        res.send(JSON.stringify(response));
        return true;
      });
    }).catch((err) => {
      return false;
    });
  }

  var defIssuers = acceptableIssuers || [homeIssuer];
  var defEmail = {
    contact: account.emailContact,
    receipt: account.offerEmailRecipt,
    refund: account.offerEmailRefund,
  };

  paymentRequest.payment_url = serverDomain + paymentPath + "/payment"
  paymentRequest.currency = paymentRequest.currency || defaultCurrency;
  paymentRequest.email = paymentRequest.email || defEmail;

  if (!paymentRequest.currency) {
    res.status(400).send("Missing currency");
    return;
  }

  paymentRequest.payment_id = paymentRequest.payment_id || uuidv1();
  console.log("new payment_id saved - ", paymentRequest.payment_id);
  paymentRequest.issuers = paymentRequest.issuers || defIssuers;

  var data = Object.assign({
    account_id: account_id,
    status: "initial",
  }, paymentRequest);

  promise.then((finished) => {
    if (finished) {
      return true;
    }

    db.insert("payments", data).then((records) => {
      // records.insertedIds['0'];
      delete paymentRequest.return_url;
      // paymentRequest.id = paymentRequest.payment_id;

      // Set status to timeout when expiring
      var secs = exp - now;
      console.log(now, paymentRequest.expires, secs);
      setTimeout(() => {
        var query = {
          payment_id: paymentRequest.payment_id,
          status: { $in: ["initial"] },
        }
        console.log("Payment expired - " + query.payment_id);
        db.findAndModify("payments", query, { status: "timeout" });
      }, secs);

      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(paymentRequest));
    }).catch((err) => {
      res.status(400).send(err.message || err);
      return false;
    });
  });
}

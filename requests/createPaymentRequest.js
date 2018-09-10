var uuidv1 = require('uuid/v1');

var db = require('../db');

exports.createPaymentRequest = function (req, res) {
  var {
    account,
    account_id,
  } = req.body;

  var {
    acceptableIssuers,
    defaultCurrency,
    defaultTimeout,
    homeIssuer,
    paymentPath,
    serverDomain,
  } = account;

  var defIssuers = acceptableIssuers || [homeIssuer];
  var defEmail = {
    contact: account.emailContact,
    receipt: account.offerEmailRecipt,
    refund: account.offerEmailRefund,
  };

  // Prepare the paymentRequest
  var paymentRequest = Object.assign({}, req.body);
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

  paymentRequest.payment_url = serverDomain + paymentPath + "/payment"
  paymentRequest.currency = paymentRequest.currency || defaultCurrency;
  paymentRequest.email = paymentRequest.email || defEmail;

  if (!paymentRequest.currency) {
    res.status(400).send("Missing currency");
    return;
  }

  var now = new Date();
  var exp = new Date().addSeconds(defaultTimeout);
  paymentRequest.expires = paymentRequest.expires || exp.toISOString();

  paymentRequest.payment_id = paymentRequest.payment_id || uuidv1();
  console.log("new payment_id saved - ", paymentRequest.payment_id);
  paymentRequest.issuers = paymentRequest.issuers || defIssuers;

  var data = Object.assign({
    account_id: account_id,
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
    }, secs);

    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(paymentRequest));
  }).catch((err) => {
    res.status(400).send(err.message || err);
    return;
  });
}

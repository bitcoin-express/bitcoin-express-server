const uuidv1 = require('uuid/v1');
const config = require('config');

var db = require('../db');
var { getDomainFromURL } = require('../issuer/utils');


function cleanResponse(paymentRequest) {
  if (typeof paymentRequest == "string") {
    paymentRequest = JSON.parse(paymentRequest);
  }
  delete paymentRequest.ack_memo;
  delete paymentRequest.return_url;
  delete paymentRequest.forceError;
  return paymentRequest;
}

exports.createPaymentRequest = function (req, res) {
  var {
    account,
    account_id,
    merchant_data,
  } = req.body;

  var {
    acceptable_issuers,
    default_payment_currency,
    default_payment_timeout,
    domain,
    home_issuer
  } = account;

  merchant_data = String(merchant_data);

  var now = new Date();
  var exp = new Date().addSeconds(default_payment_timeout);

  var paymentRequest = Object.assign({}, req.body);

  paymentRequest.expires = paymentRequest.expires || exp;
  paymentRequest.time = now;

  const { return_url } = paymentRequest;
  if (return_url) {
    paymentRequest.seller = getDomainFromURL(return_url);
  } else if (domain) {
    paymentRequest.seller = domain;
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

  if (config.has('account.email_customer_contact') && config.get('account.email_customer_contact').length > 0) {
    paymentRequest.email_customer_contact = config.get('account.email_customer_contact');
  }

  if (!paymentRequest.return_url) {
    // res.status(400).send("No return_url included");
    paymentRequest.return_url = `domain:${domain}`;
  }

  var promise = Promise.resolve(false);
  if (merchant_data) {
    var query = {
      account_id: account_id,
      merchant_data: merchant_data,
    };

    promise = db.findOne('payments', query).then((resp) => {
      if (!resp) {
        return false;
      }
      console.log("Found payment with merchant_data " + merchant_data);

      delete resp.privateKey;
      delete resp.authToken;
      delete resp.account_id;
      delete resp._id;

      if (resp.status == "resolved") {
        // The payment is inmutable
        res.send(JSON.stringify(cleanResponse(resp)));
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
        res.send(JSON.stringify(cleanResponse(response)));
        return true;
      });
    }).catch((err) => {
      return false;
    });
  }

  var defIssuers = acceptable_issuers || [home_issuer];

  var defEmail = {
    contact: account.email_customer_contact,
    receipt: account.provide_receipt_via_email || config.get('account.provide_receipt_via_email'),
    refund: account.provide_refund_via_email || config.get('account.provide_refund_via_email'),
  };

  paymentRequest.payment_url = config.get('server.api.endpoint_url') + config.get('server.api.endpoint_path') + "/payment"
  paymentRequest.currency = paymentRequest.currency || default_payment_currency;
  paymentRequest.email = paymentRequest.email || defEmail;

  if (!paymentRequest.currency) {
    res.status(400).send("Missing currency");
    return;
  }



  // TODO: we are not checking if this payment id already exists and if it's assigned to this specific user
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
      paymentRequest = cleanResponse(paymentRequest);
      // Set status to timeout when expiring
      var secs = exp - now;
      console.log(now, paymentRequest.expires, secs);
      setTimeout(() => {
        var query = {
          payment_id: paymentRequest.payment_id,
          status: { $in: ["initial"] },
        };

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

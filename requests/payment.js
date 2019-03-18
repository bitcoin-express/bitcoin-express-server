var db = require('../db');
var issuer = require('../issuer');
var utils = require('../issuer/utils');

exports.payment = function (req, res) {
  var {
    coins,
    id,
    payment_id,
    merchant_data,
    memo,
    receipt_to,
    refund_to,
    // The next params are  used for this demo,
    // it needs to be implemented
    client,
    language_preference,
  } = req.body;

  if (!payment_id && !merchant_data) {
    res.status(400).send("Missing payment_id or merchant_data");
    return;
  }

  if (!coins || coins.length == 0) {
    res.status(400).send("No coins included");
    return;
  }

  var ack_memo, expires, key, tid, verifiedCoins, host, seller,
    amount, currency, returnUrl, verifyInfo, accountId;

  var query = payment_id ? {
    payment_id: payment_id
  } : {
    merchant_data: merchant_data
  };

  db.findOne('transactions', query).then((resp) => {
    if (!resp) {
      // throw new Error("Can not find payment with payment_id " + payment_id);
      var response = {
        PaymentAck: {
          status: "payment_unknow",
        }
      };
      res.send(JSON.stringify(response));
      // if error message is "-1", the catch clause ignores the exception
      throw new Error("-1");
    }

    if (resp.forceError) {
      res.status(400).send("Error forced by forceError parameter");
      return;
    }

    ack_memo = resp.ack_memo;
    returnUrl = resp.return_url;
    seller = resp.seller;

    if (!returnUrl) {
      res.status(400).send("No return_url in this payment");
      // if error message is "-1", the catch clause ignores the exception
      throw new Error("-1");
    }

    // STATUS RESOLVED - Return the payment directly.
    if (resp.status == "resolved") {
      var response = {
        PaymentAck: {
          status: "ok",
          id: id || payment_id,
          return_url: returnUrl,
        }
      };

      if (ack_memo) {
        response.PaymentAck.memo = ack_memo;
      }
      if (seller) {
        response.PaymentAck.seller = seller;
      }

      res.setHeader('Content-Type', 'application/json');
      console.log("*** PAYMENT COMPLETED AND CORRECT ***");
      res.send(JSON.stringify(response));
      // if error message is "-1", the catch clause ignores the exception
      throw new Error("-1");
    }

    // STATUS TIMEOUT or PROCESSING - Return the error, not possible to proceed
    // with the payment
    if (resp.status == "processing") {
      throw new Error("A payment is already in process for this request.");
    }
    if (resp.status == "timeout") {
      throw new Error("The payment expired.");
    }

    amount = resp.amount;
    currency = resp.currency;
    expires = resp.expires;
    accountId = resp.account_id;

    var defIssuers = resp.issuers;

    if (!coins.every(c => currency == utils.Coin(c).c)) {
      throw new Error("Some coins are not from the requested currency");
    }

    if (utils.coinsValue(coins) < amount) {
      throw new Error("The coins sended are not enough");
    }

    // this is coming from issuer list
    var host = utils.Coin(coins[0]).d;
    console.log("coins host - " + host);

    var inIssuerList = (c) => {
      var coin = utils.Coin(c);
      var coinDomain = coin.d;
      var inList = defIssuers.indexOf(coinDomain) > -1;
      return inList && coinDomain == host;
    };

    if (defIssuers[0] != "*" && !coins.every(inIssuerList)) {
      throw new Error("Some coins are not from the list of acceptable " +
        "issuers or mixed coins are from different issuers."
      );
    }

    var modifyOptions = { return_original: true }; // returns payment document before being modified
    var modification = { status: "processing" };
    var promiseModifyPayment = db.findAndModify(
      'transactions', query, modification, modifyOptions
    );

    var promiseBeginIssuer = issuer.post('begin', {
      issuerRequest: {
        fn: "verify"
      }
    }, host);

    var promiseFindAccount = db.findOne("accounts", {
      "_id": accountId
    });

    return Promise.all([promiseModifyPayment, promiseBeginIssuer, promiseFindAccount]);
  }).then(([prevPayment, vi, account]) => {
    tid = vi.issuerResponse.headerInfo.tid;

    if (!account) {
      throw new Error("Payment account does not exist");
    }

    if (prevPayment.status != "initial") {
      // RACE CONDITION - WEIRD TO HAPPEN
      // It seems another payment request arrived and modify the payment status.
      throw new Error("Thre is a payment processing this request or the " +
        "payment has just expired."
      );
    }

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
    return issuer.post('verify', payload, host);
  }).then((resp) => {
    verifiedCoins = resp.issuerResponse.coin;
    verifyInfo = resp.issuerResponse.verifyInfo;
    console.log("verified coins ", verifiedCoins);

    var value = verifyInfo.actualValue;
    if (value < amount) {
      throw new Error("After verify coins, the amount is not enough");
    }

    // TODO: this sctructure is used many times in different places - it should be a class. Usages: db.insert - maybe more
    var coinData = {
      account_id: accountId,
      coins: verifiedCoins,
      currency: currency,
      date: new Date(),
      value: value,
    }
    if (memo) coinData["memo"] = memo;
    if (client) coinData["client"] = client;
    if (payment_id) coinData["payment_id"] = payment_id;
    if (merchant_data) coinData["merchant_data"] = merchant_data;

    return db.insert("coins", coinData);
  }).then((records) => {
    var payData = {
      status: "resolved",
      verifyInfo: verifyInfo,
      paid: new Date(),
    };
    if (memo) payData["memo"] = memo;
    if (client) payData["client"] = client;
    if (receipt_to) payData["receipt_to"] = receipt_to;
    if (refund_to) payData["refund_to"] = refund_to;

    var prom1 = db.findAndModify('transactions', query, payData);
    var prom2 = issuer.post('end', {
      issuerRequest: {
        tid: tid
      }
    }, host);

    return Promise.all([prom1, prom2]);
  }).then((responses) => {
    var response = {
      PaymentAck: {
        status: "ok",
        id: id || payment_id,
        return_url: returnUrl,
      }
    };

    if (ack_memo) {
      response.PaymentAck.memo = ack_memo;
    }
    if (seller) {
      response.PaymentAck.seller = seller;
    }

    res.setHeader('Content-Type', 'application/json');
    console.log("*** PAYMENT COMPLETED AND CORRECT ***");
    res.send(JSON.stringify(response));
  }).catch((err) => {
    if (err.message == "-1") {
      // A way to escape from the chain of promises.
      // Ignore errors when message is "-1"
      return;
    }

    res.status(400).send(err.message || err);
    if (tid && host) {
      // 'end' issuer transaction, but it can be ignored. 
      issuer.post('end', {
        issuerRequest: {
          tid: tid
        }
      }, host);
    }
  });
}

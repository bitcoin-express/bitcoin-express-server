var coinSelection = require('./coinSelection');
var atob = require('atob');

var issuer = require('../issuer');

function Coin (base64) {
  try {
    let obj = JSON.parse(atob(base64));  
    obj.base64 = base64;
    obj.value = _round(parseFloat(obj.v), 8);
    return obj;
  } catch(err) {
    throw err;
    return null;
  }
}

exports.Coin = Coin;

function _round(number, precision) {
  let factor = Math.pow(10, precision);
  let tempNumber = number * factor;
  return Math.round(tempNumber) / factor;
}

exports.redeemCoins = function (coins, address, args, db, crypto=null) {
  let defaults = {
    target: "0",
    action: "redeem",
    newCoinList: [],
    speed: "fastestFee",
    expiryPeriod_ms: 0.5,
    policy: "single",
  };

  args = Object.assign({}, defaults, args);

  if (typeof(address) !== 'string') {
    // Cannot recover
    return Promise.reject(Error("Bitcoin address was not a String"));
  }

  if (!Array.isArray(coins) || coins.length==0) {
    return Promise.reject(Error("No Coins provided"));
  }

  let wrongType = false;
  let base64Coins = new Array();
  let sumCoins = 0.0;

  coins.forEach((elt) => {
    if (typeof elt === "string") {
      let c = Coin(elt);
      sumCoins += parseFloat(c.value);
      base64Coins.push(elt);
      return;
    }
    sumCoins += elt.value;
    if (elt.base64) {
      base64Coins.push(elt.base64);
      return;
    }
    wrongType = true;
  });

  if (wrongType) {
    // Cannot recover
    return Promise.reject(Error("Redeem requires Coin or base64 string"));
  }

  let expiryEmail = this._fillEmailArray(sumCoins);
  if (expiryEmail != null) {
    args.expiryEmail = expiryEmail;
  }


  // TO_DO is promise??? Is it worth???
  // _ensureDomainIsSet(args, coins);

  let startRedeem = (beginResponse) => {
    args.beginResponse = args.beginResponse || beginResponse;

    const tid = beginResponse.headerInfo.tid;
    const redeemExp = parseFloat(this.getSettingsVariable(REDEEM_EXPIRE)) * (1000 * 60 * 60);
    const now = new Date().getTime();
    const newExpiry = isNaN(args.expiryPeriod) ? now + redeemExp : args.expiryPeriod;

    if (!crypto) {
      crypto = this.getPersistentVariable(CRYPTO, "XBT");
    }

    let redeemRequest = {
      issuerRequest: {
        tid: tid,
        expiry: new Date(newExpiry).toISOString(),
        fn: "redeem",
        bitcoinAddress: address,
        coin: base64Coins,
        issuePolicy: args.policy || DEFAULT_SETTINGS.issuePolicy,
        bitcoinSpeed: args.speed,
      },
      recovery: {
        fn: "redeem",
        domain: beginResponse.headerInfo.domain,
        action: args.action,
      },
    };

    if (args.target > 0) {
      redeemRequest.issuerRequest.targetValue = args.target;
    }

    if (typeof(args.comment) === "string") {
      redeemRequest.recovery.comment = args.comment;
    }

    // if expiryEmail is defined and the fee is less than the sum of coins,
    // add it to the request 
    if (Array.isArray(args.expiryEmail) && args.expiryEmail.length > 0) {
      let issuer = args.beginResponse.issuer.find((elt) =>  {
        return elt.relationship == "home";
      });
      let feeExpiryEmail = issuer ? Number.parseFloat(issuer.feeExpiryEmail || "0") : 0;
      let change = (sumCoins - args.target - issuer.bitcoinFees[args.speed]);
      if (change > feeExpiryEmail) {
        redeemRequest.issuerRequest.expiryEmail = args.expiryEmail;
        redeemRequest.recovery.expiryEmail = args.expiryEmail;
      }
    }

    return db.insert("session", { tid: tid, request: redeemRequest }).then((records) => {
      return db.extractCoins(base64Coins);
    }).then(() => {
      return _redeemCoins_inner_(redeemRequest, args, db, crypto);
    }).catch((err) => {
      return insertCoins(db, base64Coins).then(() => {
        throw err;
      });
    });
  };

  if (args.beginResponse) {
    return startRedeem(args.beginResponse);
  }

  const params = {
    issuerRequest: {
      fn: "redeem"
    }
  };
  return issuer.post("begin", params).then(startRedeem);
}


function _redeemCoins_inner_(request, args, db, crypto = null) {
  delete request.recovery;
  let resp = null;
  let tid = null;

  return issuer.post("redeem", request).then((response) => {
    resp = response;
    tid = resp.headerInfo.tid;

    if (resp.deferInfo) {
      // deferred, no need to call again, just throw the error
      throw new Error("Redeem deferred. Try again in the future.");
    }

    if (resp.status !== "ok") {
      let errMsg = "Redeem response status is not 'ok'";
      if (resp.error && resp.error.length > 0) {
        errMsg = resp.error[0].message || errMsg;
      }
      throw new Error(errMsg);
    }

    if (resp.redeemInfo && args.comment) {
      // used mainly when for bitcoin uri has a message or lable
      resp.redeemInfo.comment = args.comment;
    }
    if (resp.headerInfo && args.action) {
      resp.headerInfo.fn = args.action;
    }

    if (resp.coin && resp.coin.length > 0) {
      return insertCoins(db, resp.coin);
    }
    return 0;
  }).then((numCoins) => {
    resp.currency = crypto || "XBT";
    return db.insert("bitcoin_transactions", resp);
  }).then(() => {
    return db.remove("session", { tid: tid });
  }).then(() => {
    return issuer.post("end", {
      issuerRequest: {
        tid: tid,
      }
    });
  }).then(() => resp);
}

/**
 * Transfer funds from the Wallet to a standard Bitcoin address.
 *
 * @param uri [string] A bitcoin uri that complies with BIP:21
 *
 * @param speed [string] Indicates the urgency of this payment.
 *   Note: the current balance must be sufficient to pay an appropriate
 *   fee for the specified speed.
 *
 * @param confirmation [function] (optional) A function to be called to
 *   allow the user to confirm the payment.
 */
exports.transferBitcoin = function (uri, db, speed, confirmation) {
  let payment = coinSelection.parseBitcoinURI(uri);

  if (!payment) {
    throw new Error ("Invalid Bitcoin uri");
    return;
  }

  const {
    amount,
    address,
    message,
    label,
  } = payment;

  let comment = message;
  if (label) {
    comment = comment ? `${comment} | ${label}` : label;
  }

  // The total value redeemed must include the bitcoin
  // transaction fee.
  // The transaction fee is optional but if the fee paid
  // is too little it is likely to t a long time to complete.
  const params = {
    issuerRequest: {
      fn: "redeem"
    }
  };
  let balance = 0;
  let coins = [];

  return db.getCoinList().then((resp) => {
    coins = resp;
    balance = issuer.coinsValue(coins);

    if (!coins.every((c) => ["XBT", "BTC"].indexOf(Coin(c).c > -1))) {
      throw new Error("Some coins with incorrect currency");
    }

    if (balance < amount) {
      throw new Error("Insufficient funds");
    }

    return issuer.post("begin", params);
  }).then((resp) => {
    var beginResponse = resp.issuerResponse;
    if (beginResponse.deferInfo) {
      throw new Error(beginResponse.deferInfo.reason);
    }
    if (beginResponse.status !== "ok") {
      throw new Error("Problem on initialiting issuer");
    }

    const recommendedFees = beginResponse.issuer[0].bitcoinFees;
    const bitcoinFee = recommendedFees[speed] || 0;

    let paymentAmount = parseFloat(amount);
    if (paymentAmount <= 0) {
      throw new Error("Amount must be positive");
    }

    let txAmount = _round(paymentAmount + bitcoinFee, 8);
    if (txAmount > balance) {
      throw new Error("Insufficient funds to pay fees");
    }

    let args = {
      singleCoin: false, //false so as to minimise the fee element
      beginResponse: beginResponse,
      target: amount,
      speed: speed,
      comment: comment,
      action: `send XBT${amount}`,
      uri: uri,
      address: address,
    };

    let selection = coinSelection.coinSelection(txAmount, resp, args);

    if (!selection.targetValue || Number.isNaN(selection.targetValue)) {
      throw new Error("Amount is not a number");
    }

    // coinSelection will select coins expecting to pay a fee.
    // However, redeemCoins does not attract a fee if the change
    // is smaller than the smallest coin sent. For this reason we
    // need to remove the smallest coins so long as there are
    // sufficient funds to satisfy the transactionAmount 
    if (selection.targetValue !== 0 && selection.faceValue >= txAmount) {
      let allCoins = selection.toVerify.concat(selection.selection);
      
      allCoins.sort((a,b) => {
        //we need allCoins in smallest value order
        if (a.value < b.value) { return -1; }
        if (a.value > b.value) { return 1; }
        return 0;
      });

      let change = _round(selection.faceValue - txAmount, 8);
      while(allCoins.length > 1) {
        if ((change < allCoins[0].value)) {
          break;
        }
        // remove extra coin
        change -= allCoins.shift().value;
      }

      args.inCoinCount = allCoins.length;
      args.outCoinCount = 1;

      confirmation = confirmation || function (_x, _y, fn) { fn(); };
      return new Promise((resolve, reject) => {
        confirmation(parseFloat(amount), bitcoinFee, () => {
          const params = [allCoins, address, args, db, "XBT"];
          coinSelection.redeemCoins(...params).then(resolve).catch(reject);
        });
      });
    } else {
      return Promise.reject(Error("Insufficient funds"));
    }
  });
}


function insertCoins(db, base64Coins) {
  var promises = base64Coins.map((c) => {
    return db.insert("coins", {
      "coins": c,
      "currency": Coin(c).c,
      "date": new Date().toISOString()
    });
  });

  return Promise.all(promises).then(() => base64Coins.length);
}

function _ensureDomainIsSet(args, coins) {
  let self = this;
  //When /begin has already returned a response, we must use that Issuer's domain 
  if (args.beginResponse && args.beginResponse.headerInfo && args.beginResponse.headerInfo.domain) {
    args.domain = args.beginResponse.headerInfo.domain;
  } else if (typeof(args.domain) === "undefined") {
    //Set the domain if all coins come from the same Issuer
    args.domain = self._getSameDomain(coins);    
  }
  //finally use the default issuer 
  if (args.domain === null) {
    args.domain = self.getSettingsVariable(self.config.DEFAULT_ISSUER);
  }
}



var https = require('https');
var atob = require('atob');
var coinSelection = require('./coinSelection');

// Set issuer data for payment coins verification
var options = {
  host: 'be.ap.rmp.net',
  port: 443,
  headers: {
    'Content-Type': 'application/json',
    'accept': '*/*'
  },
};

exports.get = function (endpoint) {
  options.method = 'GET';
  options.path = `/Bitcoin-express/v1/issuer/${endpoint}`;
  return issuerRequest(options, endpoint);
}

exports.post = function (endpoint, data) {
  options.method = 'POST';
  options.path = `/Bitcoin-express/v1/issuer/${endpoint}`;
  options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
  return issuerRequest(options, endpoint, data);
}

exports.coinsValue = function(coins) {
  let sumCoins = 0;
  coins.forEach((elt) => {
    if (typeof elt === "string") {
      sumCoins += Coin(elt).value || 0;
    } else {
      sumCoins += elt.value || 0;
    }
  });
  return sumCoins;
}

function issuerRequest(options, endpoint, data=null) {

  return new Promise((resolve, reject) => {
    var req = https.request(options, (resp) => {
      var rawData = '';
      resp.on('data', function(chunk) {
        rawData += chunk;
      });
      resp.on('end', function() {
        try {
          resolve(JSON.parse(rawData));
          return;
        } catch (e) {
          reject(e);
          return;
        }
      });
    });

    req.on("error", function(e) {
      reject(e);
      return;
    });

    req.write(JSON.stringify(data));
    req.end();
  });
}


function Coin(base64) {
  try {
    let obj = JSON.parse(atob(base64));  
    obj.base64 = base64;
    obj.value = _round(parseFloat(obj.v), 8);
    return obj;
  } catch(err) {
    return null;
  }
}

function _round(number, precision) {
  let factor = Math.pow(10, precision);
  let tempNumber = number * factor;
  return Math.round(tempNumber) / factor;
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
    // TO_DO: check if all are XBT
    coins = resp;
    balance = this.coinsValue(coins);
    if (balance < amount) {
      throw new Error("Insufficient funds");
    }
    return this.post("begin", params);
  }).then((beginResponse) => {
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

    let txAmount = this.round(paymentAmount + bitcoinFee, 8);
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

      let change = this.round(selection.faceValue - txAmount, 8);
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

function redeemCoins(coins, address, args, db, crypto=null) {
  const {
    bitcoinSpeed,
    COIN_STORE,
    CRYPTO,
    ISSUE_POLICY,
    REDEEM_EXPIRE,
    SESSION,
  } = this.config;

  let defaults = {
    target: "0",
    action: "redeem",
    newCoinList: [],
    speed: bitcoinSpeed,
    expiryPeriod_ms: this.getExpiryPeriod(REDEEM_EXPIRE),
    policy: this.getSettingsVariable(ISSUE_POLICY),
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

  coins.forEach(function(elt) {
    if (typeof elt === "string") {
      let c = Coin(elt);
      sumCoins += parseFloat(c.value);
      base64Coins.push(elt);
      return;
    }
    sumCoins += elt.value;
    if ("base64" in elt) {
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

    // TO_DO: save in DB the tid ??
    return storage.setToPromise(SESSION, tid, redeemRequest).then(() => {
      // TO_DO: take out those coins from the DB
      return this.extractCoins(base64Coins, tid);
    }).then(() => {
      return _redeemCoins_inner_(redeemRequest, args, db, crypto);
    }).then((response) => {
      return response;
    }).catch((err) => {
      // TO_DO: return coins to the DB
      return storage.addAllIfAbsent(COIN_STORE, base64Coins, false, crypto).then(() => {
        return Promise.reject(err);
      }).catch((err) => {
        return Promise.reject(err);
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
  // TO_DO: what should be do with args? check issuer call in WalletBF
  return this.post("begin", params, args).then(startRedeem);
}

function _ensureDomainIsSet(args, coins) {
  let self = this;
  //When /begin has already returned a response, we must use that Issuer's domain 
  if ("beginResponse" in args && "headerInfo" in args.beginResponse && "domain" in args.beginResponse.headerInfo) {
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


function _redeemCoins_inner_(request, args, db, crypto = null) {
  let req = JSON.parse(JSON.stringify(request));
  // clone the request in case of deferral
  delete request.recovery;

  let resp = null;

  const {
    COIN_STORE,
    CRYPTO,
    debug,
    SESSION,
    storage,
  } = this.config;

  if (!crypto) {
    crypto = "XBT";
  }

  // TO_DO: same here, what to do with args?
  return this.post("redeem", request, args).then((response) => {
    resp = response;

    if (resp.deferInfo) {
      // deferred, no need to call again, just throw the error
      throw new Error("Redeem deferred. Try again in the future.");
    }

    if (resp.status !== "ok") {
      let errMsg = "Redeem response status is not 'ok'";
      if (resp.error && resp.error.length > 0) {
        errMsg = resp.error[0].message;
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
      // TO_DO: add new coins in the DB and return the num of coins
      return storage.addAllIfAbsent(COIN_STORE, resp.coin, false, crypto);
    }
    return 0;
  }).then((numCoins) => {
    resp.other = Object.assign({}, args.other || {}, resp.redeemInfo);
    resp.currency = crypto;
    // TO_DO: save transaction in the DB
    return this.recordTransaction(resp);
  }).then(() => {
    // TO_DO: remove from session in the DB
    return storage.removeFrom(SESSION, resp.headerInfo.tid);
  }).then(() => {
    // TO_DO: again, what about the args?
    return this.post("end", {
      issuerRequest: {
        tid: resp.headerInfo.tid,
      }
    }, {
      domain: args.domain,
    });
  }).then(() => {
    return resp;
  });
}

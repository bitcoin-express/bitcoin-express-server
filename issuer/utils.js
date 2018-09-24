var atob = require('atob');

var issuer = require('../issuer');
var coinSelection = require('./coinSelection');

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

exports.coinsValue = function (coins) {
  let sumCoins = 0;
  coins.forEach((elt) => {
    if (typeof elt === "string") {
      var coin = this.Coin(elt);
      if (!coin) {
        return;
      }
      sumCoins += coin.value || 0;
    } else {
      sumCoins += elt.value || 0;
    }
  });
  return parseFloat(sumCoins.toFixed(8));
}

function _round(number, precision) {
  let factor = Math.pow(10, precision);
  let tempNumber = number * factor;
  return Math.round(tempNumber) / factor;
}


exports.transferBitcoin = function (uri, coins, balance, speed, accountId) {
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

  // The total value redeemed must include the bitcoin
  // transaction fee.
  // The transaction fee is optional but if the fee paid
  // is too little it is likely to t a long time to complete.
  const params = {
    issuerRequest: {
      fn: "redeem"
    }
  };

  return issuer.post("begin", params).then((resp) => {
    var beginResponse = resp.issuerResponse;
    if (beginResponse.deferInfo) {
      throw new Error(beginResponse.deferInfo.reason);
    }
    if (beginResponse.status !== "ok") {
      throw new Error("Problem on initialiting issuer");
    }

    const recommendedFees = beginResponse.issuer[0].bitcoinFees;
    const bitcoinFee = recommendedFees[speed] || 0;

    let txAmount = _round(parseFloat(amount) + bitcoinFee, 8);
    if (txAmount > balance) {
      throw new Error("Insufficient funds to pay fees");
    }

    let args = {
      singleCoin: false, //false so as to minimise the fee element
      beginResponse: beginResponse,
      target: amount,
      speed: speed,
      comment: message,
      action: `send XBT${amount}`,
      uri: uri,
      address: address,
    };

    let selection = coinSelection.coinSelection(txAmount, coins, args);

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

      return new Promise((resolve, reject) => {
        console.log("Coins to redeem ", allCoins);
        const params = [allCoins, address, args, accountId];
        coinSelection.redeemCoins(...params).then(resolve).catch(reject);
      });
    } else {
      throw new Error("Insufficient funds");
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


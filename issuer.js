var https = require('https');
var atob = require('atob');

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
  let roundedTempNumber = Math.round(tempNumber);
  return roundedTempNumber / factor;
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
  return 0;
}

var https = require('https');

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

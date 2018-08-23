var bodyParser = require('body-parser');
var express = require('express');
var exphbs = require('express-handlebars');

var http = require('http');
var https = require('https');

var app = express();
var pwd = "1234";

app.engine('handlebars', exphbs({
  defaultLayout: 'main',
  // Specify helpers which are only registered on this instance.
  helpers: {
    json: function (context) { return JSON.stringify(context); },
  }
}));
app.set('view engine', 'handlebars');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// GET - https://localhost:8080/
app.get('/', function (req, res) {
  var merchantServer = "";
  var post_data = JSON.stringify({
    amount: 0.0000095,
    currency: "XBT",
    issuers: ["be.ap.rmp.net", "eu.carrotpay.com"],
    memo: "The art of asking",
    return_url: "http://amandapalmer.net/wp-content/themes/afp/art-of-asking/images/hero_mask.png",
    return_memo: "Thank you for buying this image",
    email: {
      contact: "sales@merchant.com",
      receipt: true,
      refund: false
    },
    authentication: pwd,
  });

  console.log(post_data);

  var options = {
    host: 'localhost',
    port: '8443',
    path: '/createPaymentRequest',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(post_data)
    }
  };

  // Ignore the invalid self-signed ssl certificate
  // insecure!!
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  var str = '';
  var post_req = https.request(options, function(response) {
    response.setEncoding('utf8');

    response.on('data', function (chunk) {
      str += chunk;
    });

    response.on('end', function () {
      console.log(str);
      const { statusCode } = response;
      console.log(statusCode);
      if (statusCode == 200) {
        res.render('home', { paymentDetails: JSON.parse(str) });
      } else {
        res.render('error', { error: str });
      }
      // your code here if you want to use the results !
    });

  });

  post_req.write(post_data);
  post_req.end();
});

var httpServer = http.createServer(app);
httpServer.listen(8080, function() {
  console.log('Listening on port 8080...');
});


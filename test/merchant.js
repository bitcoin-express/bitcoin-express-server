var bodyParser = require('body-parser');
var express = require('express');
var exphbs = require('express-handlebars');

var http = require('http');
var https = require('https');

var app = express();
var pwd = "DDtKEXuZnlk=";

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
app.use(express.static(__dirname + '/assets'));

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// GET - https://localhost:8080/
app.get('/', function (req, res) {
  var post_data = JSON.stringify({
    amount: 0.000002,
    return_url: ". The item bought is empty",
    // "https://www.audible.com/pd/The-Art-of-Asking-Audiobook/B00OQT8AG2",
    memo: "The art of asking",
    auth: pwd,
    seller: "SuperStore",
  });

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
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  var str = '';
  var post_req = https.request(options, function(response) {
    response.setEncoding('utf8');

    response.on('data', function (chunk) {
      str += chunk;
    });

    response.on('end', function () {
      const { statusCode } = response;
      if (statusCode == 200) {
        res.render('home', { paymentDetails: JSON.parse(str) });
      } else {
        res.render('error', { error: str });
      }
    });

  });

  post_req.write(post_data);
  post_req.end();
});

// GET - https://localhost:8080/pay
app.post('/pay', function (req, res) {
  // Inject the response if payment is correct
  var payment = req.body.Payment;
  console.log(req.body)

  var post_data = JSON.stringify(Object.assign({
    auth: pwd,
  }, payment));
  console.log(post_data);

  var options = {
    host: 'localhost',
    port: '8443',
    path: '/payment',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(post_data)
    }
  };

  // Ignore the invalid self-signed ssl certificate
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  var str = '';
  var post_req = https.request(options, function(response) {
    response.setEncoding('utf8');

    response.on('data', function (chunk) {
      str += chunk;
    });

    response.on('end', function () {
      const { statusCode } = response;
      if (statusCode == 200) {
        console.log(str);
        // add 
        // memo: "Thank you for buying this item",
        res.send(str);
      } else {
        res.status(400).send(str);
      }
    });
  });

  post_req.write(post_data);
  post_req.end();
});

app.get('/panel', function (req, res) {
  var options = {
    host: 'localhost',
    port: '8443',
    path: '/getBalance',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  };

  // Ignore the invalid self-signed ssl certificate
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  var str = '';
  var get_req = https.request(options, function(response) {
    response.setEncoding('utf8');

    response.on('data', function (chunk) {
      str += chunk;
    });

    response.on('end', function () {
      const { statusCode } = response;
      if (statusCode == 200) {
        res.send(str);
      } else {
        res.status(400).send(str);
      }
    });

  });
  get_req.end();
});

var httpServer = http.createServer(app);
httpServer.listen(8080, function() {
  console.log('Listening on port 8080...');
});


var bodyParser = require('body-parser');
var express = require('express');
var fs = require('fs');
var https = require('https');
var ObjectId = require('mongodb').ObjectId;

var { createPaymentRequest } = require("./requests/createPaymentRequest");
var { getBalance } = require("./requests/getBalance");
var { getCoins } = require("./requests/getCoins");
var { getPaymentStatus } = require("./requests/getPaymentStatus");
var { getTransactions } = require("./requests/getTransactions");
var { payment } = require("./requests/payment");
var { redeem } = require("./requests/redeem");

var db = require('./db');

var {
  authentication,
  dbConnection
} = require("./config.json");

var {
  authMiddleware,
  corsMiddleware,
} = require('./middlewares');

var app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(corsMiddleware);
!authentication || authentication.length == 0 || app.use(authMiddleware);

// Connect to Mongo on start
db.connect(dbConnection, function (err) {
  if (err) {
    console.log('Unable to connect to MongoDB.')
    process.exit(1)
    return;
  }

  app.get('/', (req, res) => {
    res.send('Hello Bitcoin-Express wallet merchant!');
  });
  app.post('/createPaymentRequest', createPaymentRequest);
  app.get('/getBalance', getBalance);
  app.post('/getCoins', getCoins);
  app.get('/getPaymentStatus', getPaymentStatus);
  app.get('/getTransactions', getTransactions);
  app.post('/payment', payment);
  app.post('/redeem', redeem);

  var privateKey  = fs.readFileSync('./sslcert/bitcoinexpress.key', 'utf8');
  var certificate = fs.readFileSync('./sslcert/bitcoinexpress.crt', 'utf8');

  var httpsServer = https.createServer({
    key: privateKey,
    cert: certificate,
    passphrase: 'bitcoinexpress'
  }, app);

  httpsServer.listen(8443, function() {
    console.log('Listening on port 8443...');
  });
})

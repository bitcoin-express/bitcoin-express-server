const express = require('express');
const session = require('express-session');
const config = require('config');


// Check if all keys, essential for application running, are set in config files.
// If not - prevent application from running.
for (let key of config.get('_system_required_keys')) {
  if (!config.has(key)) {
    throw new Error(`Missing required configuration key: ${key}`);
  }
}


var fs = require('fs');
var bodyParser = require('body-parser');
var https = require('https');
var exphbs = require('express-handlebars');

var { createPaymentRequest } = require("./requests/createPaymentRequest");
var { getBalance } = require("./requests/getBalance");
var { getCoins } = require("./requests/getCoins");
var { getPaymentStatus } = require("./requests/getPaymentStatus");
var { getTransactions } = require("./requests/getTransactions");
var { payment } = require("./requests/payment");
var { redeem } = require("./requests/redeem");
var { register } = require("./requests/register");
var { setConfig } = require("./requests/setConfig");


var db = require('./db');

var {
  authMiddleware,
  corsMiddleware,
} = require('./middlewares');

var { panelRoute } = require('./routes');

var app = express();

Date.prototype.addSeconds = function (s) {
  this.setSeconds(this.getSeconds() + parseInt(s));
  return this;
}


// Prepare templating for Control Panel
app.engine('handlebars', exphbs({
  defaultLayout: 'main',
  // Specify helpers which are only registered on this instance.
  helpers: {
    json: function (context) { return JSON.stringify(context); },
  }
}));
app.set('view engine', 'handlebars');
app.use(express.static(__dirname + '/assets'));


// Middelwares and config for REST API
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(corsMiddleware);
app.use(authMiddleware);
app.use(session({
  secret: 'btc-express',
  resave: true,
  saveUninitialized: true
}));



// Connect to Mongo on start
db.connect(config.get('server.db.url'), function (err) {
  if (err) {
    console.log('Unable to connect to MongoDB.')
    process.exit(1)
    return;
  }

  app.get('/', (req, res) => {
    res.render('index');
  });
  app.all('/panel/*', panelRoute);

  app.post('/createPaymentRequest', createPaymentRequest);
  app.get('/getBalance', getBalance);
  app.post('/getCoins', getCoins);
  app.get('/getPaymentStatus', getPaymentStatus);
  app.get('/getTransactions', getTransactions);
  app.post('/payment', payment);
  app.post('/redeem', redeem);
  app.post('/register', register);
  app.post('/setConfig', setConfig);

  var privateKey  = fs.readFileSync('./sslcert/bitcoinexpress.key', 'utf8');
  var certificate = fs.readFileSync('./sslcert/bitcoinexpress.crt', 'utf8');

  var httpsServer = https.createServer({
    key: privateKey,
    cert: certificate,
    passphrase: 'bitcoinexpress'
  }, app);

  httpsServer.listen(config.get('server.port'), function() {
    console.log(`Listening on port ${config.get('server.port')}...`);
  });

  setInterval(() => {
    var now = new Date().addSeconds(30); // 30 sec
    var query = {
      expires: { $lt: now.toISOString() },
      status: { $in: ["initial", "timeout"] },
    };
    db.remove("payments", query).then((resp) => {
      console.log('SCHEDULER - Removing expired requests before ' + now.toISOString(), resp);
    });
  }, 5 * 60 * 1000); // interval of 5 min
})

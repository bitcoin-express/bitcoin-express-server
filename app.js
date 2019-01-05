const express = require('express');
const session = require('express-session');
const config = require('config');
const api = require(config.get('system.root_dir') + '/core/api.js');

// Check if all keys, essential for application running, are set in config files.
// If not - prevent application from running.
for (let key of config.get('_system_required_keys')) {
  if (!config.has(key)) {
    throw new Error(`Missing required configuration key: ${key}`);
  }
}


var fs = require('fs');
var bodyParser = require('body-parser');

const web_server = {
  handler: undefined,
  options: undefined,
};

if (config.get('server.ssl.disabled')) {
    web_server.handler = require('http');
    web_server.options = {};
}
else {
    web_server.handler = require('https');
    web_server.options = {
        key: fs.readFileSync(config.get('server.ssl.key_file_path'), config.get('server.ssl.key_file_encoding')),
        cert: fs.readFileSync(config.get('server.ssl.certificate_file_path'), config.get('server.ssl.certificate_file_encoding')),
        passphrase: config.get('server.ssl.key_file_passphrase')
    };
}

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


const db = require(config.get('system.root_dir') + '/db');
const middleware = require(config.get('system.root_dir') + '/middlewares');
const app = express();

var { panelRoute } = require('./routes');

Date.prototype.addSeconds = function (s) {
  this.setSeconds(this.getSeconds() + parseInt(s));
  return this;
};


// Prepare templating for Control Panel
app.engine('handlebars', exphbs({
  defaultLayout: 'main',
  // Specify helpers which are only registered on this instance.
  helpers: {
    json: function (context) { return JSON.stringify(context); },
  }
}));
app.set('view engine', 'handlebars');
app.set('x-powered-by', false);
app.use(express.static(__dirname + '/assets'));


// Middelwares and config for REST API
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(middleware.corsMiddleware);
app.use(session({
  secret: config.get('server.session.secret'),
  resave: true,
  saveUninitialized: true
}));



// Connect to Mongo on start
db.connect(config.get('server.db.uri'), function (err) {
  if (err) {
    console.log('Unable to connect to MongoDB.', err);
    process.exit(1);
    return;
  }

  app.get('/', (req, res) => {
    res.render('index');
  });
  app.all('/panel/*', middleware.noAuthentication, panelRoute);

  app.post('/createPaymentRequest', middleware.requireAuthentication, createPaymentRequest);
  app.get('/getBalance', middleware.requireAuthentication, getBalance);
  app.post('/getCoins', middleware.requireAuthentication, getCoins);
  app.get('/getPaymentStatus', middleware.requireAuthentication, getPaymentStatus);
  app.get('/getTransactions', middleware.requireAuthentication, getTransactions);
  app.post('/payment', middleware.noAuthentication, payment);
  app.post('/redeem', middleware.requireAuthentication, redeem);
  app.post('/register', middleware.noAuthentication, register);
  app.post('/setConfig', middleware.requireAuthentication, setConfig);

    const asyncWrapper = fn =>
        function asyncWrap(...args) {
            const result = fn(...args);
            const next = args[args.length-1];
            const res = args[args.length-2];
            return Promise.resolve(result).catch(error => {
                //TODO: log
                console.log('API router async wrapper - uncaught error', error);

                const { JSONResponseEnvelope } = require(config.get('system.root_dir') + '/core/models/JSONResponseEnvelope');
                const { Message } = require(config.get('system.root_dir') + '/core/models/Message');

                return res.type('application/json').status(500).send(new JSONResponseEnvelope({
                        success: false,
                        body: [],
                        messages: [ new Message({
                                type: Message.TYPE_ERROR,
                                body: "Something went wrong on a server side and we couldn't handle that properly. Try again and in case of failing - contact us.",
                            }),
                        ],
                    }).prepareResponse(res));
            });
        };


    app.route('/v1.0a/transactions')
     .get(middleware.requireAuthentication, asyncWrapper(api.getTransactions))
     .post(middleware.requireAuthentication, asyncWrapper(api.postTransactions));

    app.route('/v1.0a/transaction/:transaction_id')
     .get(middleware.requireAuthentication, asyncWrapper(api.getTransactionById));

    app.route('/v1.0a/transaction/:transaction_id/payment')
     .get(middleware.noAuthentication);

    app.route('/v1.0a/accounts')
     .post(middleware.noAuthentication, asyncWrapper(api.postAccounts));

    app.route('/v1.0a/account/settings')
     .get(middleware.requireAuthentication, asyncWrapper(api.getAccountSettings))
     .patch(middleware.requireAuthentication, asyncWrapper(api.patchAccountSettings));

    app.route('/v1.0a/account/balance')
     .get(middleware.requireAuthentication, asyncWrapper(api.getAccountBalance));


    web_server.handler.createServer(web_server.options, app)
              .listen(config.get('server.port'), function() {
                console.log(`Listening on port ${config.get('server.port')}...`);
    });

  setInterval(() => {
    const now = new Date().addSeconds(30); // 30 sec
    const query = {
      expires: { $lt: now },
      status: { $in: ["initial", "timeout"] },
    };

    db.remove('transactions', query).then((resp) => {
      console.log('SCHEDULER - Removing expired requests before ' + now.toUTCString(), 'Items removed: '+resp.n);
    }).catch((err) => {
      console.log('SCHEDULER ERROR - Removing expired requests before ' + now.toUTCString(), err);
    });
  }, 5 * 60 * 1000); // interval of 5 min
})

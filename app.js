const express = require('express');
const session = require('express-session');
const config = require('config');
const api = require(config.get('system.root_dir') + '/core/api');
const { Transaction } = require(config.get('system.root_dir') + '/core/models/Transaction');

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

const exphbs = require('express-handlebars');
const { createPaymentRequest } = require("./requests/createPaymentRequest");
const { getBalance } = require("./requests/getBalance");
const { getCoins } = require("./requests/getCoins");
const { getPaymentStatus } = require("./requests/getPaymentStatus");
const { getTransactions } = require("./requests/getTransactions");
const { payment } = require("./requests/payment");
const { redeem } = require("./requests/redeem");
const { register } = require("./requests/register");
const { setConfig } = require("./requests/setConfig");


const db = require(config.get('system.root_dir') + '/db');
const middleware = require(config.get('system.root_dir') + '/core/middlewares');
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


    for (let route_config of api.routes.values()) {
        app.route(route_config.path)[route_config.method](...route_config.actions);
    }

    web_server.handler.createServer(web_server.options, app)
              .listen(config.get('server.port'), function() {
                console.log(`Listening on port ${config.get('server.port')}...`);
    });

    setTimeout(() => {
        let query = {
            type: { $eq: Transaction.TYPE__PAYMENT, },
            status: { $eq: Transaction.STATUS__INITIAL, },
            expire: { $lte: new Date(), }
        };

        db.findAndModify('transactions', query, { status: Transaction.STATUS__EXPIRED, }).
        then((result) => {
            console.log('Expired payment transactions', result);
        }).
        catch((error) => {
            console.log('Error during expiring transactions', error);
        });
    }, 5 * 60 * 1000);

    if (config.get('system.remove_expired_transactions')) {
        setInterval(() => {
            const now = new Date().addSeconds(30); // 30 sec
            const query = {
                expires: { $lt: now },
                status: { $in: ["initial", "timeout"] },
            };

            db.remove('transactions', query).then((resp) => {
                console.log('SCHEDULER - Removing expired requests before ' + now.toUTCString(), 'Items removed: ' + resp.n);
            }).catch((err) => {
                console.log('SCHEDULER ERROR - Removing expired requests before ' + now.toUTCString(), err);
            });
        }, 5 * 60 * 1000); // interval of 5 min
    }
});

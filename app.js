const config = require('config');
const express = require('express');
const session = require('express-session');
const exphbs = require('express-handlebars');
const fs = require('fs');
const bodyParser = require('body-parser');

const api = require(config.get('system.root_dir') + '/core/api');
const { Transaction } = require(config.get('system.root_dir') + '/core/models/Transaction');
const { JSONResponseEnvelope } = require(config.get('system.root_dir') + '/core/models/JSONResponses');
const { Message } = require(config.get('system.root_dir') + '/core/models/Message');

const { panelRoute } = require('./routes');

// Check if all keys, essential for application running, are set in config files.
// If not - prevent application from running.
for (let key of config.get('_system_required_keys')) {
  if (!config.has(key)) {
    throw new Error(`Missing required configuration key: ${key}`);
  }
}

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

const db = require(config.get('system.root_dir') + '/db');
const middleware = require(config.get('system.root_dir') + '/core/middlewares');
const api_helpers = require(config.get('system.root_dir') + '/core/api/helpers');
const app = express();

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
// TODO: To think: should this be used for /panel route as well as it is now? is there a security threat?
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

    app.get('/', (req, res) => { res.render('index'); });
    app.all('/panel/*', api_helpers.noAuthentication, panelRoute);

    for (let route_config of api.routes.values()) {
        app.route(route_config.path)[route_config.method](...route_config.actions);
    }

    app.use(function(req, res, next) {
        let response = new JSONResponseEnvelope();
        response.messages.push(new Message({ type: Message.TYPE__ERROR, body: "Path not found", }));

        res.status(404).send(response);
    });

    app.use(function(err, req, res, next) {
        console.log('Unhandled router error', err);

        let response = new JSONResponseEnvelope();
        response.messages.push(new Message({ type: Message.TYPE__ERROR, body: "Internal error", }));

        res.status(err.status || 500).send(response);
    });

    web_server.handler.createServer(
        web_server.options, app).listen(config.get('server.port'), function() {
            console.log(`Listening on port ${config.get('server.port')}...`);
        }
    );

    console.log('Migrating hanging pending Transactions to deferred...');

    db.updateMany('transactions',
        { type: { $eq: Transaction.TYPE__PAYMENT, }, status: { $eq: Transaction.STATUS__PENDING, }, },
        { status: Transaction.STATUS__DEFERRED, }).
    then((result) => {
        console.log('Pending Transactions migrated to deferred: ', result.modifiedCount);
    }).
    catch((error) => {
        console.log('Error during pending to deferred migration: ', error);
    });

    console.log('Done.');

    setTimeout(() => {
        let query = {
            type: { $eq: Transaction.TYPE__PAYMENT, },
            status: { $eq: Transaction.STATUS__INITIAL, },
            expires: { $lte: new Date(), }
        };

        db.updateMany('transactions', query, { status: Transaction.STATUS__EXPIRED, }).
        then((result) => {
            console.log('Expired payment transactions: ', result.modifiedCount);
        }).
        catch((error) => {
            console.log('Error during expiring transactions: ', error);
        });
    }, 5 * 1000);

    if (config.get('system.remove_expired_transactions')) {
        setInterval(() => {
            const now = new Date().addSeconds(30); // 30 sec

            const query = {
                expires: { $lt: now },
                status: { $in: [ Transaction.STATUS__INITIAL, Transaction.STATUS__EXPIRED, ] },
            };

            db.remove('transactions', query).then((resp) => {
                console.log('SCHEDULER - Removing expired requests before ' + now.toUTCString(), 'Items removed: ' + resp.n);
            }).catch((err) => {
                console.log('SCHEDULER ERROR - Removing expired requests before ' + now.toUTCString(), err);
            });
        }, 5 * 60 * 1000); // interval of 5 min
    }
});

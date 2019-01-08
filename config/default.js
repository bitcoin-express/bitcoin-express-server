/*
    This file contains all allowed config keys to be used within the application.
    Application is using node config module (https://github.com/lorenwest/node-config) to handle config files.

    By default application will read config/default.js file and use configuration keys stored in it.

    In order to provide a mechanism to support environment's specific configuration the application will look for files
    extending the main configuration file where name of this file is stored in an environment variable: NODE_ENV

    In order to store sensitive information the application will look for a file called local.js and use configuration
    stored in it. This file may include credentials, database name and host etc.

    An example - assuming that NODE_ENV is set to "production" load order will be as follows:
    default.json5
    production.js
    local.js

    !!!   Please bear in mind that local.js should never be added into repository
    !!!   and is excluded on main .gitignore level.

    Files lower in the overriding chain should only include elements that need be overwritten.

    Special keys:
    * _system_required_keys:
      app.js before server initialisation will check if all essential settings, mentioned in this key, are set and throw
      an error if configuration is not full,
    * _account_readonly_settings:
      Account settings that are accessible/visible by users but can't be overwritten. These keys can't be modified via
      setConfig method although they will be returned in getSettings set,
    * _account_hidden_settings:
      Account settings that are hidden and not visible by users in any way. These keys won't be returned in
      getSettings set.
    * _register_required_keys:
      Keys that are required to be provided during registration of a new account.
    * _register_allowed_keys:
      Keys that are allowed to be provided during registration of a new account.
*/

var defer = require('config/defer').deferConfig;

module.exports = {

  // Server-specific configuration. Not to be shared with users.
  server: {
    // General settings

    // Port number that node.js will run on
    port: '8443',

    // Database related settings
    db: {
      // Database connection scheme i.e. mongodb
      scheme: 'mongodb',

      // Database connection host/ip i.e. localhost
      address: 'localhost',

      // Port that database interface is accessible on i.e. 27017
      port: '27017',

      // Database name
      name: 'bitcoin-express',

      // Database user with read/write role
      user: undefined,

      // Database user's password
      password: undefined,

      // Pre-constructed full database connection uri
      uri: defer(function() {
        let uri = `${this.server.db.scheme}://`;

        if (this.server.db.user) {
          uri += `${this.server.db.user}:${this.server.db.password}@`;
        }

        uri += this.server.db.address;

        if (this.server.db.port) {
          uri += `:${this.server.db.port}`;
        }

        uri += `/${this.server.db.name}`;

        return uri;
      }),

      // MongoDB specific settings
      mongodb: {
        // Name of replica set that database uses in order to support transactions
        replica_set: undefined,
      }
    },


    // API related settings
    api: {
      // URL that AI endpoint is accessible from the Internet, in most cases domain under which gateway is operating
      // i.e.: scheme://address[:port]
      endpoint_url: undefined,

      // Path to the API endpoint, used to create API requests to other API methods via the external link
      endpoint_path: ''
    },


    // SSL related settings
    ssl: {
      // If for some reason you want to run http version of a web server, instead of https, set this option to true
      // Remember to change server.port as well if necessary
      disabled: false,

      key_file_path: `${__dirname}/../sslcert/bitcoinexpress.key`,
      key_file_encoding: 'utf8',
      key_file_passphrase: undefined,

      certificate_file_path: `${__dirname}/../sslcert/bitcoinexpress.crt`,
      certificate_file_encoding: 'utf8',
    },


    // Session related settings
    session: {
      secret: undefined,
    },
  },

  // Default account-specific configuration
  account: {
    //TODO: remove config.js

    // Merchant's contact email for customer related queries
    email_customer_contact: undefined,

    // Merchant's contact email for account related queries
    email_account_contact: undefined,

    // Merchant's domain that will be displayed to the user
    domain: undefined,

    // Merchant's name given to the account
    name: undefined,

    settings: {
        // If there is no currency set on user's account or in payment request use this as a default
        default_payment_currency: 'XBT',

        // Time in seconds after which a payment requested will be invalidated and no longer possible to proceed
        default_payment_timeout: 3600,

        // Is a merchant providing an option to send a receipt via email
        provide_receipt_via_email: false,

        // Is a merchant providing an option to send a refund via email
        provide_refund_via_email: false,

        // A default issuer to work with
        home_issuer: 'be.ap.rmp.net',

        // Issuers that the Merchant accepts Coins from
        acceptable_issuers: [ 'eu.carrotpay.com', 'be.ap.rmp.net', ],

        // Settings that can be configured on the account level but do not require default values.
        // These are used for checking by set Settings fail-safe mechanisms
        // TODO: create default values in Settings
        // A valid url where the purchased product may be obtained and/or transaction may be finalised
        return_url: '',

        // A valid url where the notification about purchase will be send
        callback_url: '',
    },
  },

  // Keys that are required to be provided during registration of a new account
  _register_required_keys: [ 'domain', ],

  // Keys that are allowed to be provided during registration of a new account
  _register_allowed_keys: [ 'domain', 'name', 'email_customer_contact', 'email_account_contact', ],

  // Settings that are essential for application to run correctly. It's an array of keys' full paths.
  _system_required_keys: [ 'server.db.mongodb.replica_set', 'server.db.user', 'server.db.password', 'server.db.scheme', 'server.db.address', 'server.db.name', 'server.api.endpoint_url', 'server.api.endpoint_path',
      'server.ssl.key_file_passphrase', 'server.session.secret', ],

  // Account settings that are accessible/visible by users but can't be overwritten
  _account_readonly_settings: [ ],

  // Account settings that are hidden and not visible by users in any way
  _account_hidden_settings: [ ],

  // !!!! SYSTEM SETTINGS !!!!
  // DO NOT MODIFY ANYTHING BELOW THIS LINE UNLESS YOU REALLY KNOW WHAT YOU ARE DOING!
  // THIS MAY - AND WILL - AFFECT HOW THE WHOLE APPLICATION WORKS AND MAY LEAD TO SERVER CRASH AND/OR LOOSING DATA -
  // INCLUDING TRANSACTIONS LOGS!
  //
  // YOU HAVE BEEN WARNED!
  //
    system: {
        decimal_point_precision: 8,
        root_dir: require('path').resolve(`${__dirname}/..`),
        supported_payment_currencies: [ 'XBT', ],
        remove_expired_transactions: false,
    },
};


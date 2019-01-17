"use strict";

/*  Modules imports
*/

const uuidv4 = require('uuid/v4');
const config = require('config');
const db = require(config.get('system.root_dir') + '/db');
const checks = require(config.get('system.root_dir') + '/core/checks');
const request = require('request');
// const { routes } = require(config.get('system.root_dir') + '/core/api');
const utils = require(config.get('system.root_dir') + '/issuer/utils');
const issuer = require(config.get('system.root_dir') + '/issuer');
const endpoints = require(config.get('system.root_dir') + '/core/api/endpoints');
const { Settings } = require(config.get('system.root_dir') + '/core/models/Settings');
const { Account } = require(config.get('system.root_dir') + '/core/models/Account');
const { PaymentConfirmation } = require(config.get('system.root_dir') + '/core/models/PaymentConfirmation');
const { PaymentAck } = require(config.get('system.root_dir') + '/core/models/PaymentAck');
const { BaseModel } = require(config.get('system.root_dir') + '/core/models/BaseModel');

const errors = require(config.get('system.root_dir') + '/core/models/Errors');
/*  Models imports
*/
const { ObjectId } = require('mongodb');

/*  Possible transaction statuses, shared among different types of transactions.
    It is possible that specific types of transactions won't be supporting all statuses.
    If it's needed to verify the validity of transaction's status it can be done by setting a transaction type's
    specific validator (described under _transaction_properties_validators).
*/

const TRANSACTION_STATUS__INITIAL = 'initial';
const TRANSACTION_STATUS__RESOLVED = 'resolved';
const TRANSACTION_STATUS__ABORTED = 'aborted';
const TRANSACTION_STATUS__EXPIRED = 'expired';
const TRANSACTION_STATUS__PROCESSING = 'processing';

const TRANSACTION_STATUSES = new Set([
    TRANSACTION_STATUS__INITIAL,
    TRANSACTION_STATUS__RESOLVED,
    TRANSACTION_STATUS__ABORTED,
    TRANSACTION_STATUS__EXPIRED,
    TRANSACTION_STATUS__PROCESSING,
]);


/*  Possible transaction types. In order to create an object of specific type it is required to define and then declare
    a corresponding class in TRANSACTION_CLASSES.
    This structure is not exported and available on the outside of this file. Transaction's types are available through
    static TYPES property of the Transaction class.
*/
const TRANSACTION_TYPE__PAYMENT = 'payment';
const TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER = 'blockchain-transfer';
const TRANSACTION_TYPE__COIN_FILE_TRANSFER = 'coin-file-transfer';

const TRANSACTION_TYPES = new Set([
    TRANSACTION_TYPE__PAYMENT,
    TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER,
    TRANSACTION_TYPE__COIN_FILE_TRANSFER,
]);


/*  Possible blockchain transfer speeds to be used in blockchain transfer transactions mapped to corresponding values on
    the issuer API side.
*/

const BLOCKCHAIN_TRANSFER_SPEED = new Map([
    [ 'fastest', 'fastest', ],
    [ 'soon', 'soon', ],
    [ 'no-hurry', 'noHurry', ],
    [ 'min-fee', 'minFee', ],
]);


const TRANSACTION_ALLOWED_PROPERTIES = new Map([
    [ TRANSACTION_TYPE__PAYMENT, new Set([ 'type', 'order_id', 'value', 'currency', 'description', 'notification',
            'return_url', 'callback_url', 'acceptable_issuers', 'email_customer_contact', 'policies', 'expires',
            'transaction_id', 'created', 'updated', 'seller', 'payment_url', 'status', 'account_id', 'confirmation_details',
            'verify_details', 'completed',
        ]),
    ],
    [ TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER, new Set([ 'transaction_id', 'status', 'type', 'currency', 'value',
            'description', 'speed', 'address', 'label', 'account_id', 'created', 'updated', 'completed',
        ]),
    ],
    [ TRANSACTION_TYPE__COIN_FILE_TRANSFER, new Set([ 'created', 'updated', 'type', ]), ],
]);

const TRANSACTION_REQUIRED_PROPERTIES = new Map([
    [ TRANSACTION_TYPE__PAYMENT, new Set([ 'type', 'value', 'currency', 'description', 'acceptable_issuers',
            'transaction_id', 'seller', 'payment_url', 'status', 'account_id',
        ]),
    ],
    [ TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER, new Set([ 'transaction_id', 'type', 'currency', 'value', 'address', ]), ],
    [ TRANSACTION_TYPE__COIN_FILE_TRANSFER, new Set([]), ],
]);

const TRANSACTION_HIDDEN_PROPERTIES = new Map([
    [ TRANSACTION_TYPE__PAYMENT, new Set([ 'account_id', ]), ],
    [ TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER, new Set([ 'account_id', ]), ],
    [ TRANSACTION_TYPE__COIN_FILE_TRANSFER, new Set([ 'account_id', ]), ],
]);

const TRANSACTION_READONLY_PROPERTIES = new Map([
    [ TRANSACTION_TYPE__PAYMENT, new Set([ 'acceptable_issuers', 'type', 'updated', 'completed', ]), ],
    [ TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER, new Set([ 'updated', 'created', 'type', 'completed', ]), ],
    [ TRANSACTION_TYPE__COIN_FILE_TRANSFER, new Set([ 'updated', 'created', 'type', 'completed', ]), ],
]);

/*  Default transfer speed to be used if it's not defined in the transaction
*/

const BLOCKCHAIN_TRANSFER_SPEED__DEFAULT = 'fastest';


/*  Symbols for internal usage only to enable private properties functionality inside Transaction type classes
*/

/*  Symbol used to internally allow to initialise an empty object. It is being used to wrap object's data read from
    the database without invoking setters methods for object's properties as this normally happens inside a constructor.
*/

const _initialise_empty_object = Symbol('_initialise_empty_object');


/*  Symbol used to privately store a db session in order to use it for db transactions
*/

const _db_session = Symbol('_db_session');


/*  Symbol used to privately store object's data. Objects needs to have two kinds of interfaces available - private and
    public. Public is available through object's getters and setters and always works on validated and/or parsed data.
    Private on the other hand needs to sometimes work on raw, unaltered data and this data are available through a
    property identified by this symbol.
*/

const _transaction_data = Symbol('_transaction_data');
const _transaction_interface = Symbol('_transaction_interface');


/*  This structure defines all writable transactions' properties together with their validators.
    Transaction's constructor checks if a property is defined in this structure and if it isn't, it is defining it as
    read-only. It means that it still can be set using a private object's interface but can't be altered by the public
    object's interface using setters.

    Two types of validator are available:
    - global: defined   under property name, i.e. description
    - class-specific:   defined under key's name constructed using property name glued together using two underscores with
                        an object's class name, eg. description__BlockchainTransferTransaction

    Object's constructor will check for a class-specific validator and use it in the setter, then for a global validator
    and if none of this is found - set a property as read-only.

    If a situation where a property is only a container for an external value and we don't want to check it's content
    but still make it available to be set via the public interface it should be defined by simply returning true
    e.g. verify_details: details => true
*/

const _transaction_properties_validators = {
    account_id: (account_id) => true,
    order_id: (order_id) => {
        if (order_id !== undefined && (typeof order_id !== "string" || order_id.length < 1 || order_id.length > 64)) {
            throw new Error ('Invalid format');
        }
    },
    expires: (date) => {
        if (!(date instanceof Date)) { throw new Error ('Invalid format'); }
    },
    return_url: Settings.VALIDATORS.return_url,
    callback_url: Settings.VALIDATORS.callback_url,
    value: (value) => {
        if (!value) {
            throw new Error ('Required field');
        }

        if (!checks.isFloat(value) || value > 9999999999) {
            throw new Error('Invalid format');
        }

        if (parseFloat(value) <= 0) {
            throw new Error('Invalid value');
        }
    },
    description: BaseModel.VALIDATORS.description,
    notification: (text) => {
        if (text !== undefined && (typeof text !== "string" || text.length < 1 || text.length > 128)) {
            throw new Error('Invalid format');
        }
    },
    email_customer_contact: Account.VALIDATORS.email_customer_contact,
    policies: (policies) => {
        if (!policies) {
            return true;
        }

        if (typeof policies !== "object") {
            throw new Error('Invalid format');
        }

        let allowed_policies = [ 'receipt_via_email', 'refund_via_email', ];
        for (let policy of Object.keys(policies)) {
            if (!allowed_policies.includes(policy)) {
                throw new Error ('Unknown policy');
            }
            else if (typeof policies[policy] !== typeof true) {
                throw new Error ('Invalid format');
            }
        }
    },
    currency: Settings.VALIDATORS.default_payment_currency,
    status: status => {
        if (!TRANSACTION_STATUSES.has(status)) {
            throw new Error('Unknown status');
        }
    },
    confirmation_details: details => true,
    verify_details: details => true,
    completed: (date) => {
        if (!(date instanceof Date)) {
            throw new Error ('Invalid format');
        }
    },
    speed: (speed) => {
        if (speed !== undefined && !BLOCKCHAIN_TRANSFER_SPEED.has(speed)) {
            throw new Error ('Invalid value');
        }
    },
    address: (address) => {
        if (!address) {
            throw new Error ('Field required');
        }

        if (typeof address !== "string" || address.length < 1 || address.length > 256) {
            throw new Error ('Invalid format');
        }
    },
    label: (label) => {
        if (label !== undefined && (typeof label !== "string" || label.length < 1 || label.length > 64)) {
            throw new Error ('Invalid format');
        }
    },
};


/* As validators may be exposed by a public object's interface make sure that they won't be redefined in any way
 */

BaseModel.lockPropertiesOf(_transaction_properties_validators);

/*  This structure defines custom getters for object's properties. It's main purpose is to deliver a public interface for
    dynamic properties or properties that should return a default value when it was not explicitly set by the setter.
*/

const _transaction_properties_custom_getters = {
    payment_url: function () {
        return `${config.get('server.api.endpoint_url')}${config.get('server.api.endpoint_path')}${endpoints.getEndpointPath(endpoints.getPathForId(endpoints.TRANSACTION_ID_PAYMENT, this.transaction_id))}/`;
    },
    speed: function () {
        return this[_transaction_data].speed ? this[_transaction_data].speed : BLOCKCHAIN_TRANSFER_SPEED__DEFAULT;
    },
};


/* As getters may be exposed by a public object's interface make sure that they won't be redefined in any way
 */

BaseModel.lockPropertiesOf(_transaction_properties_custom_getters);


/*  This structure define custom setters for object's properties. It should be used on occasions where it's necessary to
    somehow transform the data before saving it via private interface.

    Normally an object's constructor defines a property and it's setter by running a property validator and then setting
    a property's value using the object's private interface. Before doing so, the constructor checks if there is a
    custom setter definition defined in this structure and if it is, it's using it instead.

    It is important to always run a property's validator on the beginning of the setter definition to make sure that the
    value is valid and available through a public interface.
*/

const _transaction_properties_custom_setters = {
    return_url: function (value) {
        if (value !== undefined) {
            let url = new URL(value);
            url.searchParams.set('transaction_id', this.transaction_id);

            if (this.order_id) {
                url.searchParams.set('order_id', this.order_id);
            }

            value = url.href;
        }

        this[_transaction_data]['return_url'] = value;
    },
    callback_url: function (value) {
        if (value !== undefined) {
            let url = new URL(value);
            url.searchParams.set('transaction_id', this.transaction_id);

            if (this.order_id) {
                url.searchParams.set('order_id', this.order_id);
            }

            value = url.href;
        }

        this[_transaction_data]['callback_url'] = value;
    },
};


/* As setters may be exposed by a public object's interface make sure that they won't be redefined in any way
 */

BaseModel.lockPropertiesOf(_transaction_properties_custom_getters);


class Transaction {
    constructor (init_data={}) {

        if (!init_data.type || !TRANSACTION_TYPES.has(init_data.type)) {
            throw new Error('Invalid type');
        }

        let transaction_class = TRANSACTION_CLASSES.get(init_data.type);

        return new transaction_class(init_data);
    }

    /*      Static methods      */

    static get TYPES () { return TRANSACTION_TYPES; }
    static get TYPE__PAYMENT () { return TRANSACTION_TYPE__PAYMENT; }
    static get TYPE__BLOCKCHAIN_TRANSFER () { return TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER; }
    static get TYPE__COIN_FILE_TRANSFER () { return TRANSACTION_TYPE__COIN_FILE_TRANSFER; }

    static get STATUSES () { return TRANSACTION_STATUSES; }
    static get STATUS__INITIAL () { return TRANSACTION_STATUS__INITIAL; }
    static get STATUS__PROCESSING () { return TRANSACTION_STATUS__PROCESSING; }
    static get STATUS__RESOLVED () { return TRANSACTION_STATUS__RESOLVED; }
    static get STATUS__ABORTED () { return TRANSACTION_STATUS__ABORTED; }
    static get STATUS__EXPIRED () { return TRANSACTION_STATUS__EXPIRED; }

    static get VALIDATORS () { return _transaction_properties_validators; }

    static async find({transaction_id, account_id, type, status, custom_query, offset=0, limit=100, before, after, order="descending", order_by="completed", only_valid=true }) {
        try {
            // Check if all parameters are fine
            if (transaction_id) {
                const uuid_regex = /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

                if (!uuid_regex.exec(transaction_id)) {
                    throw new Error('Missing transaction_id');
                }
            }

            if (account_id && !(account_id instanceof ObjectId)) {
                throw new Error('Missing account_id');
            }

            if (!transaction_id && !account_id) {
                throw new Error('Either transaction_id or account_id has to be provided');
            }

            if (type && !TRANSACTION_TYPES.has(type)) {
                throw new Error('Invalid type');
            }

            if (status && !TRANSACTION_STATUSES.has(status)) {
                throw new Error('Invalid status');
            }

            if (!checks.isInteger(offset)) {
                throw new Error('Invalid offset');
            }

            if (!checks.isInteger(limit)) {
                throw new Error('Invalid limit');
            }

            if (!['ascending', 'descending'].includes(order)) {
                throw new Error('Invalid order');
            }

            if (!['completed', 'created', 'time', ].includes(order_by)) {
                throw new Error('Invalid order_by');
            }

            if (before && !checks.isDate(before)) {
                throw new Error('Invalid before date');
            }

            if (after && !checks.isDate(after)) {
                throw new Error('Invalid after date');
            }

            // Initial query
            let query = typeof custom_query === 'object' ? custom_query : {};

            if (account_id) {
                query.account_id = account_id;
            }

            // Find a specific transaction
            if (transaction_id) {
                query.transaction_id = transaction_id;
            }

            // Shows only transactions created before given date
            if (before) {
                query.created = { $lt: new Date(before), };
            }

            // Shows only transactions created after given date
            if (after) {
                query.created = { $gt: new Date(after), };
            }

            // Show only transactions of a given type
            if (type) {
                query.type = { $eq: type, };
            }

            // Shows only transactions in a given status
            if (status) {
                query.status = { $eq: status, };
            }
            // If status is not forced - by default - shows only valid, not expired/aborted transactions. If it's false transactions
            // in all statuses will be returned.
            else if (only_valid) {
                query.status = { $in: [
                        TRANSACTION_STATUS__INITIAL,
                        TRANSACTION_STATUS__RESOLVED,
                        TRANSACTION_STATUS__PROCESSING, ]
                };
            }

            let found_transactions = await db.find('transactions', query, {
                projection: { _id: 0, }, offset: parseInt(offset), limit: parseInt(limit), order: order, order_by: order_by,
            });

            return await Promise.all(found_transactions.map(async found_transaction => {

                let transaction = new Transaction({ type: found_transaction.type, [_initialise_empty_object]: true, });

                transaction[_transaction_data] = await transaction.prepareInputData(found_transaction);

                return transaction;
            }));
        }
        catch (e) {
            console.log('getTransactions', e);

            throw (e instanceof Error ? e : new Error(String(e)));
        }
    }

}

exports.Transaction = Transaction;

    /*  This an interface class for all transaction-like classes.
        It defines common methods and properties used inside extending classes.

        Objects of this class should never be created as a standalone constructs.
    */
class CoreTransaction extends BaseModel {
    constructor({ allowed_properties, required_properties, hidden_properties, readonly_properties, }) {
        super({
            private_data_container_key: _transaction_data,
            private_interface_key: _transaction_interface,
            db_session_id: _db_session,
            custom_getters: _transaction_properties_custom_getters,
            custom_setters: _transaction_properties_custom_setters,
            validators: _transaction_properties_validators,
            allowed_properties: allowed_properties,
            required_properties: required_properties,
            hidden_properties: hidden_properties,
            readonly_properties: readonly_properties,
            db_table: 'transactions',
            db_id_field: 'transaction_id',
        });
    }
}


class PaymentTransaction extends CoreTransaction {
    constructor(init_data={}) {
        super({
            allowed_properties: TRANSACTION_ALLOWED_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT),
            required_properties: TRANSACTION_REQUIRED_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT),
            hidden_properties: TRANSACTION_HIDDEN_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT),
            readonly_properties: TRANSACTION_READONLY_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT),
        });

        delete init_data.type;

        for (let property of TRANSACTION_ALLOWED_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT)) {
            if (init_data[property]) {
                this[property] = init_data[property];
            }
        }

        this[_transaction_data].type = TRANSACTION_TYPE__PAYMENT;

        if (!init_data[_initialise_empty_object]) {
            this[_transaction_data].transaction_id = uuidv4();
            this[_transaction_data].status = TRANSACTION_STATUS__INITIAL;
            this[_transaction_data].account_id = init_data.account.account_id;
            this[_transaction_data].acceptable_issuers = init_data.account.settings.acceptable_issuers;

            this.return_url = init_data.return_url || init_data.account.settings.return_url || undefined;
            this[_transaction_data].seller = this.return_url ? new URL(this.return_url).hostname : init_data.account.domain;
            this.callback_url = init_data.callback_url || init_data.account.settings.callback_url || undefined;

            this[_transaction_data].created = new Date();
            this.expires = init_data.expires ?
                           (
                               init_data.expires instanceof Date ?
                               init_data.expires :
                               new Date(init_data.expires)
                           ) :
                           new Date(this.created.getTime() + init_data.account.settings.default_payment_timeout * 1000);

            this.email_customer_contact = init_data.email_customer_contact || init_data.account.email_customer_contact;

            this.policies = {
                receipt_via_email: init_data.policies && init_data.policies.hasOwnProperty('receipt_via_email') ?
                                   init_data.policies.receipt_via_email :
                                   init_data.account.settings.provide_receipt_via_email,
                refund_via_email: init_data.policies && init_data.policies.hasOwnProperty('refund_via_email') ?
                                  init_data.policies.refund_via_email :
                                  init_data.account.settings.provide_refund_via_email,
            };

            this.currency = init_data.currency || init_data.account.settings.default_payment_currency;


            if (init_data.account) {
                this.account_id = init_data.account.account_id;
            }

            if (!this.return_url && !this.notification) {
                throw new Error('Either return_url or notification is required');
            }
        }
    }

    async prepareInputData(input_data) {
        if (input_data.confirmation_details && !(input_data.confirmation_details instanceof PaymentConfirmation)) {
            input_data.confirmation_details = new PaymentConfirmation(input_data.confirmation_details);
        }

        return input_data;
    }

    async create() {
        let existing_transaction = undefined;

        if (this.order_id) {
            try {
                existing_transaction = await Transaction.find({
                    account_id: this.account_id,
                    custom_query: { order_id: this.order_id, },
                });
                if (existing_transaction.length > 0) {
                    existing_transaction = existing_transaction[0];
                }
                else {
                    existing_transaction = undefined;
                }
            }
            catch (e) {
                console.log ('Transaction payment order id', e);
                throw new errors.FatalError({ message: 'Unable to retrieve existing transaction', });
            }
        }

        if (existing_transaction &&
            existing_transaction.status !== Transaction.STATUS__ABORTED &&
            existing_transaction.status !== Transaction.STATUS__EXPIRED
        ) {
            if (existing_transaction.status === Transaction.STATUS__PROCESSING) {
                throw new errors.InvalidValueError({ message: `Transaction with order_id ${this.order_id} is currently being processed.`});
            }
            else if (existing_transaction.status === Transaction.STATUS__RESOLVED) {
                throw new errors.InvalidValueError({ message: `Transaction with order_id ${this.order_id} is already resolved.`});
            }
            else if (existing_transaction.status === Transaction.STATUS__INITIAL) {
                let changes = {};

                for (let property of TRANSACTION_ALLOWED_PROPERTIES.get(TRANSACTION_TYPE__PAYMENT)) {
                    if (this[property] !== existing_transaction[property]) {
                        changes[property] = this[property] || '';
                    }
                }

                if (Object.keys(changes).length) {
                    if (!this[_transaction_data]._updates_history) {
                        this[_transaction_data]._updates_history = [];
                    }

                    changes._updated = new Date();
                    this[_transaction_data]._updates_history.push(changes);
                }

                this[_transaction_data].created = existing_transaction.created;
                this[_transaction_data].transaction_id = existing_transaction.transaction_id;

                await this.save();
            }
        }
        else {
            await super.create();
        }

        try {
            let timeout = this.expires - new Date();

            setTimeout(() => {
                let query = {
                    transaction_id: { $eq: this.transaction_id, },
                    status: { $eq: TRANSACTION_STATUS__INITIAL, },
                };

                console.log("Transaction expired - " + this.transaction_id);
                db.findAndModify('transactions', query, { status: TRANSACTION_STATUS__EXPIRED, });
            }, timeout * 1000);
        }
        catch (e) {
            throw new errors.Warning ({class_name: this.constructor.name, field: 'create', message: 'Transaction created, but failed to set the expiration timeout'});
        }

        return this;
    }

    async resolve (payment_confirmation_details) {
        let payment_ack = new PaymentAck({
            status: PaymentAck.STATUS__OK,
            return_url: this.return_url,
            memo: this.notification,
            seller: this.seller,
        });

        if (this.status === TRANSACTION_STATUS__RESOLVED) {
            payment_ack.wallet_id = this.confirmation_details.wallet_id;
            return payment_ack;
        }
        else if (this.status === TRANSACTION_STATUS__PROCESSING) {
            throw new Error("A payment is already being processed for this transaction");
        }
        else if (this.status === TRANSACTION_STATUS__EXPIRED) {
            throw new Error("Transaction expired");
        }
        else if (!payment_confirmation_details.coins.every(coin => this.currency === utils.Coin(coin).c)) {
            throw new Error("Some coins are not from the requested currency");
        }
        else if (utils.coinsValue(payment_confirmation_details.coins) < this.value) {
            throw new Error("The value of sent coins is not enough");
        }

        let coins_domain = utils.Coin(payment_confirmation_details.coins[0]).d;

        if (!payment_confirmation_details.coins.every((coin) => {
            coin = utils.Coin(coin);
            return (
                this.acceptable_issuers.includes(coin.d) ||
                this.acceptable_issuers.includes(`(${coin.d})`)
            ) && coin.d === coins_domain;
        })) {
            throw new Error(`Some coins are not from the list of acceptable issuers or selected coins are from different issuers.`);
        }

        this.status = TRANSACTION_STATUS__PROCESSING;
        this.confirmation_details = payment_confirmation_details;

        let db_session = db.getClient().startSession();
        await db_session.startTransaction();

        let issuer_begin_response, account;

        try {
            this.initDBSession(db_session);

            [ account, issuer_begin_response, ] = await Promise.all([
                Account.find(this.account_id),
                issuer.post('begin', { issuerRequest: { fn: "verify", } }, coins_domain),
                this.save(),
            ]);

            if (!account) {
                throw new Error("Payment account does not exist");
            }

            /* TODO: commiting transaction here bring a risk that transaction may stuck in processing status if
                verification fails for any reason. For now I will try to revert transaction back to initial state and
                remove confirmation details in catch block but this is not a perfect solution as save in catch block
                can fail as well.
                On the other hand if transaction fails after this commit for example on verify level, we may try to proceed
                it later on one more time as we have all the details saved.
                Currently if anything breaks and throws error in this try/catch block I'm trying to rever transaction to
                it's original state with initial status
             */
            // Commit to set transaction as processing in order to prevent new payments of modifying this transaction
            await db_session.commitTransaction();

            let issuer_verify_response = await issuer.post('verify', {
                issuerRequest: {
                    tid: issuer_begin_response.issuerResponse.headerInfo.tid,
                    expiry: this.expires,
                    coin: payment_confirmation_details.coins,
                    targetValue: this.value,
                    issuePolicy: "single",
                }
            }, coins_domain);

            let verified_coins = issuer_verify_response.issuerResponse.coin;
            let verify_info = issuer_verify_response.issuerResponse.verifyInfo;

            if (verify_info.actualValue < this.value) {
                throw new Error("The value of verified coins is not enough");
            }

            // TODO: make a class
            let coin_data = {
                account_id: this.account_id,
                coins: verified_coins,
                currency: this.currency,
                date: new Date(),
                value: verify_info.actualValue,
                transaction_id: this.transaction_id,
            };

            if (payment_confirmation_details.memo) {
                coin_data.memo = payment_confirmation_details.memo;
            }

            if (payment_confirmation_details.client_type) {
                coin_data.client_type = payment_confirmation_details.client_type;
            }

            if (this.order_id) {
                coin_data.order_id = this.order_id;
            }

            this.status = TRANSACTION_STATUS__RESOLVED;
            this.verify_details = verify_info;
            this.completed = new Date();

            await Promise.all([
                db.insert('coins', coin_data),
                this.save(),
                //TODO: Is this really necessary? what if this fails? should I revert the transaction?
                issuer.post('end', {
                    issuerRequest: {
                        tid: issuer_begin_response.issuerResponse.headerInfo.tid
                    }
                }, coins_domain),
            ]);

            payment_ack.wallet_id = payment_confirmation_details.wallet_id;

            try {
                if (this.callback_url) {
                    request(this.callback_url, (error, response, body, ) => {
                        if (error) {
                            console.log(`Transaction Payment - Payment resolve - callback url: ${this.callback_url} error:`, error);
                        }
                        else if (response && response.statusCode !== 200) {
                            console.log(`Transaction Payment - Payment resolve - callback url: ${this.callback_url} status warning: ${response.statusCode}`);
                        }
                        else {
                            console.log(`Transaction Payment - Payment resolve - callback url: ${this.callback_url} status: success`);
                        }
                    });
                }
            }
            catch (e) {
                console.log(`Transaction Payment - Payment resolve - callback url: ${this.callback_url} catch error:`, e);
            }

            return payment_ack;
        }
        catch (e) {
            console.log("Failed during finalising payment: " + e.toString());

            try {
                if (coins_domain && issuer_begin_response) {
                    issuer.post('end', {
                        issuerRequest: {
                            tid: issuer_begin_response.issuerResponse.headerInfo.tid
                        }
                    }, coins_domain);
                }
            }
            catch (e) {
                console.log("Failed during sending 'end' to an issuer: " + e.toString());
            }

            await db_session.abortTransaction();

            try {
                this.status = TRANSACTION_STATUS__INITIAL;
                this.confirmation_details = undefined;
                await db_session.startTransaction();
                await this.save();
                await db_session.commitTransaction();
            }
            catch (e) {
                console.log("Failed during finalising payment - unable to revert transaction to original state: " + e.toString());
            }

            throw e;
        }
        finally {
            this.closeDBSession();
            await db_session.endSession();
        }
    }
}


class BlockchainTransferTransaction extends CoreTransaction {
    constructor(init_data={}) {
        super({
            allowed_properties: TRANSACTION_ALLOWED_PROPERTIES.get(TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER),
            required_properties: TRANSACTION_REQUIRED_PROPERTIES.get(TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER),
            hidden_properties: TRANSACTION_HIDDEN_PROPERTIES.get(TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER),
            readonly_properties: TRANSACTION_READONLY_PROPERTIES.get(TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER),
        });

        this[_transaction_data].type = TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER;

        if (!init_data[_initialise_empty_object]) {
            this[_transaction_data].transaction_id = uuidv4();
            this[_transaction_data].status = TRANSACTION_STATUS__INITIAL;
            this[_transaction_data].account_id = init_data.account.account_id;

            for (let property of TRANSACTION_ALLOWED_PROPERTIES.get(TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER)) {
                if (!this[property]) {
                    this[property] = init_data[property];
                }
            }
        }
    }

    async create () {
        await super.create();
        await this.resolve();

        return this;
    }

    async resolve () {
        this.checkRequiredProperties();

        try {
            this.status = TRANSACTION_STATUS__PROCESSING;
            await this.save();
        }
        catch (e) {
            console.log('BlockchainTransferTransaction resolve init error', e);

            this.status = TRANSACTION_STATUS__INITIAL;
            throw e;
        }

        try {
            let coins = await db.getCoinList(this.currency, this.account_id);
            coins = coins[this.currency];

            if (!coins || !coins.length) {
                throw new Error ('No coins in a given currency');
            }

            let total_value = utils.coinsValue(coins);

            if (total_value < parseFloat(this.value)) {
                throw new Error('Invalid value');
            }

            if (!coins.every(coin => this.currency === utils.Coin(c).c)) {
                throw new Error('Invalid value');
            }

            let blockchain_uri = `bitcoin:${this.address}?amount=${this.value}`;

            if (this.description) {
                blockchain_uri += `&message=${encodeURIComponent(this.description)}}`;
            }

            if (this.label) {
                blockchain_uri += `&label=${encodeURIComponent(this.label)}`;
            }

            console.log('BlockchainTransferTransaction resolve', blockchain_uri, coins, this.value, this.speed, this.account_id);

            this.status = TRANSACTION_STATUS__RESOLVED;

            await this.save();

            this[_transaction_data].transfer_details = await utils.transferBitcoin(blockchain_uri, coins, this.value, BLOCKCHAIN_TRANSFER_SPEED.get(this.speed), this.account_id);

            this[_transaction_data].completed = new Date();

            await this.save();

            return this;
        }
        catch (e) {
            console.log('BlockchainTransferTransaction resolve error', e);

            try {
                this.status = TRANSACTION_STATUS__INITIAL;
                await this.save();
            }
            catch (e) {
                console.log('BlockchainTransferTransaction resolve error - unable to revert transaction to initial', e);
            }

            throw e;
        }
    }
    async prepareInputData(input_data) { return input_data; }
}

class CoinFileTransferTransaction extends CoreTransaction {}

const TRANSACTION_CLASSES = new Map([
    [ TRANSACTION_TYPE__PAYMENT, PaymentTransaction, ],
    [ TRANSACTION_TYPE__BLOCKCHAIN_TRANSFER, BlockchainTransferTransaction, ],
    [ TRANSACTION_TYPE__COIN_FILE_TRANSFER, CoinFileTransferTransaction, ],
]);


for (let transaction_type of TRANSACTION_TYPES) {
    let readonly_properties = TRANSACTION_READONLY_PROPERTIES.get(transaction_type);
    for (let property of TRANSACTION_ALLOWED_PROPERTIES.get(transaction_type)) {
        if (!_transaction_properties_validators.hasOwnProperty(property) &&
            !_transaction_properties_validators.hasOwnProperty(`${property}__${TRANSACTION_CLASSES.get(transaction_type).name}`) &&
            !readonly_properties.has(property)
        ) {
            readonly_properties.add(property);
        }
    }
}



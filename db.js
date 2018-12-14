const config = require('config');

const MongoClient = require('mongodb').MongoClient;
const ObjectId = require('mongodb').ObjectId;
let db_handler = null;
let db_client = null;

exports.connect = function(url, done) {
  if (db_handler) {
    return done();
  }

  MongoClient.connect(url, { useNewUrlParser: true, replicaSet: 'rs0' }, function (err, db) {
    if (err) {
      return done(err);
    }

    db_handler = db.db(config.get('server.db.name'));
    db_client = db;

    return done();
  })
};


exports.getHandler = function() {
  return db_handler;
};

exports.getClient = function() {
  return db_client;
};


exports.insert = function(name, obj, args={ db_session: undefined }) {
  if (!db_handler) {
    return Promise.reject(new Error("No DB"));
  }

  let objects = Array.isArray(obj) ? obj : [ obj ];

  return new Promise ((resolve, reject) => {
    db_handler.collection(name).insertMany(objects, { session: args.db_session }, (err, records) => {
      if (err) {
        console.log(err);
        return reject(err);
      }

      return resolve(records);
    });
  });
};


exports.remove = function(name, query, args={ db_session: undefined }) {
  if (!db_handler) {
      return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    db_handler.collection(name).deleteMany(query, { session: args.db_session }, function(err, resp) {
      if (err) {
        return reject(err);
      }

      return resolve(resp.result);
    });
  });
};


exports.findOne = function(name, query, args={ db_session: undefined }) {
  if (!db_handler) {
    return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    db_handler.collection(name).findOne(query, { session: args.db_session }, (err, resp) => {
      if (err) {
        return reject(err);
      }

      if (!resp) {
        delete query.account_id;
        return reject(new Error(`Can not find "${name}" from query "${JSON.stringify(query)}"`));
      }

      return resolve(resp);
    });
  });
};


exports.getCoinList = function (currency, account_id, args={ db_session: undefined }) {
  let query = {
    account_id: account_id
  };

  if (currency) {
    query["currency"] = currency;
  }

  return this.find("coins", query, args).then((resp) => {
    let coins = {};

    if (!resp) {
      return coins;
    }

    resp.forEach((row) => {
      let c = row["currency"];

      // TODO: what does it mean?
      // Because of SINGLE policy
      if (Array.isArray(row["coins"]) && row["coins"].length > 0) {
        let coin = row["coins"][0];

        if (coins[c]) {
          coins[c].push(coin);
        }
        else {
          coins[c] = [coin];
        }
      }
    });

    return coins;
  });
};


exports.extractCoins = function (coins, args={ db_session: undefined }) {
  var promises = coins.map((c) => {
    return this.findOne("coins", { coins: [c] }, { db_session: args.db_session });
  });

  return Promise.all(promises).then((responses) => {
    var ids = responses.map((resp) => {
      return ObjectId(resp._id);
    });

    return this.remove('coins', { _id : { $in: ids } }, { db_session: args.db_session });
  });
};


exports.find = function(name, query, args={ offset: null, limit: null, db_session: undefined, projection: {}, }) {
  if (!db_handler) {
    return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    var cursor = db_handler.collection(name).find(query, {
      projection: args.projection,
      session: args.db_session,
      skip: args.offset,
      limit: args.limit,
    });
    
    cursor.toArray((err, resp) => {
      if (err) {
        return reject(err);
      }

      let response_objects = Array.isArray(resp) ? resp : [ resp ];

      response_objects = response_objects.map((item) => {
        delete item._id;
        delete item.account_id;
        delete item.authToken;
        delete item.privateKey;

        return item;
      });

      return resolve(response_objects);
    });
  });
};

exports.findAndModify = function(name, query, modification, args={ returnOriginal: false, db_session: undefined }) {
  if (!db_handler) {
    return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    db_handler.collection(name).findOneAndUpdate(
      query,
      { $set: modification },
      { returnOriginal: args.returnOriginal, session: args.db_session },
      (err, doc) => {
        if (err) {
          return reject(err);
        }

        let result = doc.value;
        delete result._id;
        delete result.account_id;
        delete result.authToken;
        delete result.privateKey;

        return resolve(result);
      }
    );
  });
};


exports.close = function(done) {
  if (db_handler) {
    db_handler.close(function(err, result) {
      db_handler = null;
      done(err)
    });
  }
}


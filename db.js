const config = require('config');

const MongoClient = require('mongodb').MongoClient;
const ObjectId = require('mongodb').ObjectId;
let db_handler = null;
let db_client = null;

exports.connect = async function(args, done) {
  if (db_handler) {
    return done();
  }

  try {
      let db = await MongoClient.connect((args.uri || config.get('server.db.uri')), {
          useNewUrlParser: true,
          replicaSet: (args.replica_set || config.get('server.db.mongodb.replica_set')),
      });

      db_handler = db.db((args.name || config.get('server.db.name')));
      db_client = db;

      return done();
  }
  catch (err) {
      return done(err);
  }
};


exports.getHandler = function() {
  return db_handler;
};

exports.getClient = function() {
  return db_client;
};


exports.insert = function(name, obj, { db_session=undefined, }={ db_session:undefined, }) {
  if (!db_handler) {
    return Promise.reject(new Error("No DB"));
  }

  let objects = Array.isArray(obj) ? obj : [ obj ];

  return new Promise ((resolve, reject) => {
    db_handler.collection(name).insertMany(objects, { session: db_session, }, (err, records) => {
      if (err) {
        console.log(err);
        return reject(err);
      }

      return resolve(records);
    });
  });
};


exports.remove = function(name, query, { db_session=undefined, }={ db_session: undefined, }) {
  if (!db_handler) {
      return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    db_handler.collection(name).deleteMany(query, { session: db_session, }, function(err, resp) {
      if (err) {
        return reject(err);
      }

      return resolve(resp.result);
    });
  });
};


exports.findOne = function(name, query, { db_session=undefined, }={ db_session: undefined, }) {
  if (!db_handler) {
    return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    db_handler.collection(name).findOne(query, { session: db_session, }, (err, resp) => {
      if (err) {
        return reject(err);
      }

      if (!resp) {
        return reject(new Error(`Can not find "${name}" from query "${JSON.stringify(query)}"`));
      }

      return resolve(resp);
    });
  });
};


exports.getCoinList = function (currency, account_id, { db_session=undefined, }={ db_session: undefined, }) {
  let query = {
    account_id: account_id
  };

  if (currency) {
    query.currency = currency;
  }

  return this.find("coins", query, { db_session: db_session, }).then((resp) => {
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


exports.extractCoins = function (coins, { db_session=undefined, }={ db_session: undefined, }) {
  var promises = coins.map((c) => {
    return this.findOne("coins", { coins: [c] }, { db_session: db_session, });
  });

  return Promise.all(promises).then((responses) => {
    var ids = responses.map((resp) => {
      return ObjectId(resp._id);
    });

    return this.remove('coins', { _id : { $in: ids } }, { db_session: db_session, });
  });
};


exports.find = function(name, query, { offset=null, limit=null, db_session=undefined, projection={}, order='descending', order_by=undefined, sort=undefined }) {
  if (!db_handler) {
    return Promise.reject(new Error("No DB"));
  }

  let find_options = {
      projection: projection,
      session: db_session,
      skip: offset,
      limit: limit,
  };

  if (Array.isArray(sort)) {
    find_options.sort = sort;
  }
  else if (order_by) {
    find_options.sort = [ [ order_by, order, ], ];
  }

  return new Promise((resolve, reject) => {
    var cursor = db_handler.collection(name).find(query, find_options);
    
    cursor.toArray((err, resp) => {
      if (err) {
        return reject(err);
      }

      let response_objects = Array.isArray(resp) ? resp : [ resp ];

      response_objects = response_objects.map((item) => {

        return item;
      });

      return resolve(response_objects);
    });
  });
};

exports.findOneAndModify = function(name, query, modification, { return_original=false, db_session=undefined }={return_original: false, db_session: undefined}) {
  if (!db_handler) {
    return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    db_handler.collection(name).findOneAndUpdate(
      query,
      { $set: modification },
      { returnOriginal: return_original, session: db_session, },
      (err, doc) => {
        if (err) {
          return reject(err);
        }

        let result = doc.value;

        return resolve(result);
      }
    );
  });
};

exports.updateMany = function(collection, query, modification, { db_session=undefined, }={ db_session: undefined, }) {
    if (!db_handler) {
        return Promise.reject(new Error("No DB"));
    }

    return db_handler.collection(collection).updateMany(
        query,
        { $set: modification },
        { session: db_session, },
    );
};

exports.close = function(done) {
  if (db_handler) {
    db_handler.close(function(err, result) {
      db_handler = null;
      done(err)
    });
  }
};


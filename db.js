const config = require('config');

const MongoClient = require('mongodb').MongoClient;
const ObjectId = require('mongodb').ObjectId;
let db_handler = null;


exports.connect = function(url, done) {
  if (db_handler) {
    return done();
  }

  MongoClient.connect(url, { useNewUrlParser: true }, function (err, db) {
    if (err) {
      return done(err);
    }

    db_handler = db.db(config.get('server.db.name'));
    return done();
  })
};


exports.get = function() {
  return db_handler;
};


exports.insert = function(name, obj) {
  if (!db_handler) {
    return Promise.reject(new Error("No DB"));
  }

  let objects = Array.isArray(obj) ? obj : [ obj ];

  return new Promise ((resolve, reject) => {
    db_handler.collection(name).insertMany(objects, (err, records) => {
      if (err) {
        console.log(err);
        return reject(err);
      }

      return resolve(records);
    });
  });
};


exports.remove = function(name, query) {
  if (!db_handler) {
      return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    db_handler.collection(name).deleteMany(query, function(err, resp) {
      if (err) {
        return reject(err);
      }

      return resolve(resp.result);
    });
  });
};


exports.findOne = function(name, query) {
  if (!db_handler) {
    return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    db_handler.collection(name).findOne(query, (err, resp) => {
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


exports.getCoinList = function (currency, account_id) {
  let query = {
    account_id: account_id
  };

  if (currency) {
    query["currency"] = currency;
  }

  return this.find("coins", query).then((resp) => {
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


exports.extractCoins = function (coins) {
  var promises = coins.map((c) => {
    return this.findOne("coins", { coins: [c] });
  });

  return Promise.all(promises).then((responses) => {
    var ids = responses.map((resp) => {
      return ObjectId(resp._id);
    });

    return this.remove('coins', { _id : { $in: ids } });
  });
};


exports.find = function(name, query, projection={}, offset=null, limit=null) {
  if (!db_handler) {
    return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    var cursor = db_handler.collection(name).find(query, projection);

    if (offset) {
      cursor = cursor.skip(parseInt(offset));
    }

    if (limit) {
      cursor = cursor.limit(parseInt(limit));
    }

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

exports.findAndModify = function(name, query, modification, options = { new: true }) {
  if (!db_handler) {
    return Promise.reject(new Error("No DB"));
  }
  
  return new Promise((resolve, reject) => {
    db_handler.collection(name).findAndModify(
      query,
      [], // represents a sort order if multiple matches
      { $set: modification },
      options, // options - new to return the modified document
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


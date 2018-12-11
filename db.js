const config = require('config');

var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectId;

var state = {
  db: null,
};


exports.connect = function(url, done) {
  if (state.db) {
    return done();
  }

  MongoClient.connect(url, { useNewUrlParser: true }, function (err, db) {
    if (err) {
      return done(err);
    }

    state.db = db.db(config.get('server.db.name'));
    return done();
  })
};


exports.get = function() {
  return state.db;
};


exports.insert = function(name, obj) {
  if (!state.db) {
    return Promise.reject(new Error("No DB"));
  }

  let objects = Array.isArray(obj) ? obj : [ obj ];

  return new Promise ((resolve, reject) => {
    state.db.collection(name).insertMany(objects, (err, records) => {
      if (err) {
        console.log(err);
        return reject(err);
      }

      return resolve(records);
    });
  });
};


exports.remove = function(name, query) {
  if (!state.db) {
      return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    state.db.collection(name).deleteMany(query, function(err, resp) {
      if (err) {
        return reject(err);
      }

      return resolve(resp.result);
    });
  });
};


exports.findOne = function(name, query) {
  if (!state.db) {
    return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    state.db.collection(name).findOne(query, (err, resp) => {
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
}

exports.find = function(name, query, special={}, skip=null, limit=null) {
  if (!state.db) {
    return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    var cursor = state.db.collection(name).find(query, special);

    if (skip) {
      cursor = cursor.skip(parseInt(skip));
    }

    if (limit) {
      cursor = cursor.limit(parseInt(limit));
    }

    cursor.toArray((err, resp) => {
      if (err) {
        return reject(err);
      }

      if (Array.isArray(resp)) {
        resp = resp.map((item) => {
          delete item._id;
          delete item.account_id;
          delete item.authToken;
          delete item.privateKey;
          return item;
        });
      }

      return resolve(resp);
    });
  });
}

exports.findAndModify = function(name, query, modification, options = { new: true }) {
  if (!state.db) {
    return Promise.reject(new Error("No DB"));
  }
  
  return new Promise((resolve, reject) => {
    state.db.collection(name).findAndModify(
      query,
      [], // represents a sort order if multiple matches
      { $set: modification },
      options, // options - new to return the modified document
      (err, doc) => {
        if (err) {
          return reject(err);
        }

        var result = doc.value;
        delete result._id;
        delete result.account_id;
        delete result.authToken;
        delete result.privateKey;

        return resolve(result);
      }
    );
  });
}

exports.close = function(done) {
  if (state.db) {
    state.db.close(function(err, result) {
      state.db = null
      state.mode = null
      done(err)
    });
  }
}


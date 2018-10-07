var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectId;

var state = {
  db: null,
}

exports.connect = function(url, done) {
  if (state.db) return done();

  MongoClient.connect(url, { useNewUrlParser: true }, function (err, db) {
    if (err) return done(err);
    state.db = db.db("bitcoin-express");
    done();
  })
}

exports.get = function() {
  return state.db;
}

exports.insert = function(name, obj, done) {
  if (!state.db) return done(new Error("No DB"), []);

  return new Promise ((resolve, reject) => {
    state.db.collection(name).insert(obj, (err, records) => {
      if (err) {
        console.log(err);
        return reject(err);
      }
      return resolve(records);
    });
  });
}


exports.remove = function(name, query) {
  return new Promise((resolve, reject) => {
    state.db.collection(name).deleteMany(query, function(err, resp) {
      if (err) {
        return reject(err);
      }
      return resolve(resp.result);
    });
  });
}

exports.removeMultipleIds = function(name, ids) {
  var listIds = ids.map((id) => {
    return ObjectId(id);
  });

  return new Promise((resolve, reject) => {
    state.db.collection(name).remove({ _id : { $in: listIds } }, function(err, resp) {
      if (err) {
        return reject(err);
      }
      return resolve(resp);
    });
  });
}

exports.findOne = function(name, query, clean=false) {
  if (!state.db) {
    return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    state.db.collection(name).findOne(query, (err, resp) => {
      if (err) {
        return reject(err);
      }

      if (!resp) {
        var err = new Error("findOne can't find '" + name +
          "' from query '" + JSON.stringify(query) + "'" );
        return reject(err);
      }

      if (clean) {
        delete resp._id;
        delete resp.account_id;
        delete resp.authToken;
        delete resp.privateKey;
      }

      return resolve(resp);
    });
  });
}

exports.getCoinList = function (currency, account_id) {
  var query = {
    account_id: account_id
  };
  if (currency) {
    query["currency"] = currency;
  }
  return this.find("coins", query).then((resp) => {
    var coins = {};
    resp.forEach((row) => {
      var c = row["currency"];
      // Because of SINGLE policy
      var coin = row["coins"][0];
      if (coins[c]) {
        coins[c].push(coin);
      } else {
        coins[c] = [coin];
      }
    });
    return coins;
  });
}

exports.extractCoins = function (coins) {
  var promises = coins.map((c) => {
    return this.findOne("coins", { coins: [c] });
  });

  return Promise.all(promises).then((responses) => {
    var ids = responses.map((resp) => {
      return resp._id;
    });
    return this.removeMultipleIds("coins", ids);
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


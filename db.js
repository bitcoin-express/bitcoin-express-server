var MongoClient = require('mongodb').MongoClient

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
        return reject(err);
      }
      return resolve(records);
    });
  });
}

exports.findOne = function(name, query) {
  if (!state.db) {
    return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    state.db.collection(name).findOne(query, (err, resp) => {
      if (err) {
        return reject(err);
      }
      return resolve(resp);
    });
  });
}


exports.getCoinList = function () {
  return this.find("coins", {}).then((resp) => {
    var coins = resp.map((row) => {
      // Because of SINGLE policy
      return row["coins"][0];
    });
    return coins;
  });
}

exports.find = function(name, query) {
  if (!state.db) {
    return Promise.reject(new Error("No DB"));
  }

  return new Promise((resolve, reject) => {
    state.db.collection(name).find(query).toArray((err, resp) => {
      if (err) {
        return reject(err);
      }
      return resolve(resp);
    });
  });
}

exports.findAndModify = function(name, query, modification, callback) {
  if (!state.db) {
    return Promise.reject(new Error("No DB"));
  }
  
  return new Promise((resolve, reject) => {
    state.db.collection(name).findAndModify(
      query,
      [], // represents a sort order if multiple matches
      { $set: modification },
      { new: true }, // options - new to return the modified document
      (err, doc) => {
        if (err) {
          return reject(err);
        }
        return resolve(doc);
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


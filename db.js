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

  return state.db.collection(name).insert(obj, done);
}

exports.findOne = function(name, query, callback) {
  if (!state.db) return new Error("No DB");

  return state.db.collection(name).findOne(query, callback);
}

exports.findAndModify = function(name, query, modification, callback) {
  if (!state.db) return new Error("No DB");

  return state.db.collection(name).findAndModify(
    query,
    [], // represents a sort order if multiple matches
    { $set: modification },
    { new: true }, // options - new to return the modified document
    callback
  );
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


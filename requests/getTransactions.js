var db = require('../db');
const { ObjectId } = require('mongodb');

function findTransactions(account_id, { offset, limit, before, order='descending', order_by='paid' }) {
  if (!account_id) {
    return Promise.reject(new Error("Missing account id"));
  }

  let projection = {
    _id: 0,
    account_id: 0,
  };

  if (typeof account_id === "string") {
    account_id = ObjectId(account_id);
  }

  let query = { account_id: account_id };

  if (before) {
    query.time = { $lt: before };
  }

  return db.find('transactions', query, { projection: projection, offset: offset, limit: limit, order: order, order_by: order_by });
}

exports.findTransactions = findTransactions;
exports.getTransactions = function (req, res) {
  var {
    account_id,
    offset,
    orderBy,
    limit,
    before,
    order,
  } = req.query;

  if (order === 'asc' || order >= 0) {
    order = 'ascending';
  }
  else {
    order = 'descending';
  }

  findTransactions(account_id, { offset, limit, before, order, orderBy }).then((resp) => {
    var data = {
      offset: offset,
      limit: limit,
      count: resp.length,
      order_by: orderBy,
      order: order,
      result: resp,
    };

    if (before) {
      data.before = before;
    }

    res.send(JSON.stringify(data));
  }).catch((err) => {
    res.status(400).send(err.message || err);
  });
};

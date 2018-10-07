var db = require('../db');
const { ObjectId } = require('mongodb');

function findTransactions(account_id, { offset, limit, before, orderBy, descending=-1 }) {
  if (!account_id) {
    return Promise.reject(new Error("Missing account id"));
  }

  orderBy = orderBy || "paid";
  // -1: descending
  var special = {
    $orderby: { [orderBy]: descending },
    fields: {
      _id: 0,
      account_id: 0,
    }
  };

  if (typeof account_id === "string") {
    account_id = ObjectId(account_id);
  }

  var query = { account_id: account_id };
  if (before) {
    query["time"] = { $lt: before };
  }

  return db.find('payments', query, special, offset, limit);
};

exports.findTransactions = findTransactions;
exports.getTransactions = function (req, res) {
  var {
    account_id,
    offset,
    orderBy,
    limit,
    before,
  } = req.query;

  findTransactions(account_id, { offset, limit, before, orderBy }).then((resp) => {
    var data = {
      offset: offset,
      limit: limit,
      count: resp.length,
      orderBy: orderBy,
      result: resp,
    };

    if (before) {
      data["before"] = before;
    }
    res.send(JSON.stringify(data));
  }).catch((err) => {
    res.status(400).send(err.message || err);
    return;
  });
}

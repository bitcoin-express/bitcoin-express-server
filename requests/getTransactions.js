var db = require('../db');

exports.getTransactions = function (req, res) {
  var orderBy = req.query.orderBy || "paid";
  var {
    account_id,
    offset,
    limit,
    before,
  } = req.query;

  // -1: descending
  var special = {
    $orderby: { [orderBy]: -1 },
    fields: {
      _id: 0,
      account_id: 0,
    }
  };

  var query = { account_id: account_id };
  if (before) {
    query["time"] = { $lt: before };
  }

  db.find('payments', query, special, offset, limit).then((resp) => {
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

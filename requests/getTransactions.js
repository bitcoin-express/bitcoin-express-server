var db = require('../db');

exports.getTransactions = function (req, res) {
  var offset = req.query.offset || 0;
  var limit = req.query.limit || 0;
  var orderBy = req.query.orderBy || "paid";
  var before = req.query.before;

  var special = { $orderby: { [orderBy]: -1 } }; // descending

  var query = {};
  if (before) {
    query["time"] = { $lt: before };
  }

  // TO_DO - the find() will need to include a filter for the account id.
  db.find('payments', query, special).then((resp) => {
    if (offset > 0) {
      resp = resp.slice(offset, resp.length);
    }
    if (limit > 0) {
      resp = resp.slice(0, limit);
    }

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

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

  db.find('payments', query, special).then((resp) => {
    resp = resp.map((tx) => {
      if (!tx.status == "resolved") {
        // Remove the memo and return_url if not resolved
        // This can be done by the merchant, but better to make
        // sure we do it here
        delete tx.return_url;
        delete tx.return_memo;
      }
      return tx;
    });

    var data = {
      offset: offset,
      limit: limit,
      result: resp,
    };
    if (before) {
      data["after"] = before;
    }
    res.send(JSON.stringify(data));
  }).catch((err) => {
    res.status(400).send(err.message || err);
    return;
  });
}

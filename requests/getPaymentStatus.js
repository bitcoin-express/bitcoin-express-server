var db = require('../db');

exports.getPaymentStatus = function (req, res) {
  var field = req.query.queryField;
  var data = req.query.queryData;

  if (['payment_id', 'merchant_data'].indexOf(field) == -1) {
    res.status(400).send("Wrong queryField")
  }

  var query = { [field]: data };
  db.findOne('payments', query).then((resp) => {
    if (!resp) {
      res.status(400).send("Payment not found by " + field + " query parameter")
    }
    res.send(JSON.stringify(resp));
  }).catch((err) => {
    res.status(400).send(err.message || err);
    return;
  });
}

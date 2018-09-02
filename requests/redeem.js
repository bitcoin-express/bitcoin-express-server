var db = require('../db');
var issuer = require('../issuer');

exports.redeem = function (req, res) {
  var uri = req.body.address;
  var speed = req.body.speed;
  var amount = req.body.amount;
  var message = req.body.message;
  var label = req.body.label;
  /*
  var address = "35hQUijzi3QnwxCbmXpLqN4hyqGV2hgot5";
  var speed = "fastest";
  var amount = 0.000003;
  var message = "test";
  var label = "jose";
  */
  var uri = `bitcoin:${address}?amount=${amount}&message=${message}&label=${label}`;

  return issuer.transfer(uri, db, speed).then((resp) => {
    res.setHeader('Content-Type', 'application/json');
    console.log("*** BITCOIN TRANSFER COMPLETED ***");
    res.send(JSON.stringify(resp));
  }).catch((err) => {
    res.status(400).send(err.message || err);
    return;
  });
}

var express = require('express');
var db = require('./db')

var app = express();


app.engine('jade', require('jade').__express)
app.set('view engine', 'jade')

app.use(express.json());       // to support JSON-encoded bodies
app.use(express.urlencoded()); // to support URL-encoded bodies

// Connect to Mongo on start
db.connect('mongodb://localhost:27017/payments', function(err) {

  if (err) {
    console.log('Unable to connect to MongoDB.')
    process.exit(1)
    return;
  }

  app.get('/', function (req, res) {
    res.send('Hello World!');
  });

  app.get('/payment', function (req, res) {
    // Create a new payment record and return id ???
    collection.insert({"resolved": false}, function(err, records){
      var response = {
        id: records[0]._id
      };
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(response));
    });
  });

  app.post('/payment', function (req, res) {
    /*
{"Payment":{"id":"2171b569-67a8-4201-20f2-a6daef39e7d7","coins":["eyMCngiOiIwIgp9"],"merchant_data":"9992645143674","client":"web","language_preference":"en_GB","receipt_to":{"email":""},"refund_to":{"email":""}}}
    */

    var payment = req.body.Payment;
    var id =  payment.id;
    var coins = payment.coins;
    var merchant_data = payment.merchant_data;
    var client = payment.client;
    var language_preference = payment.language_preference;
    var receipt_to = payment.receipt_to;
    var refund_to = payment.refund_to;

    if (!id) {
      res.statusMessage = "Missing id";
      res.status(400).end();
    }

    if (!coins || coins.length == 0) {
      res.statusMessage = "No coins included";
      res.status(400).end();
    } 

    // get payment id from DB
    var collection = db.get().collection('payments')
    var paymentDB = collection.findOne({'_id': ObjectId(id) });

    if (!paymentDB) {
      res.statusMessage = "Can not find payment with id " + id;
      res.status(400).end();
    }

    // TO_DO: CALL ISSUER TO VERIFY COINS
    //

    // Coins verified, save them in DB and return the response
    // TO_DO save email preferences too
    collection.update({"_id": ObjectId(id)},
      { "$set": { "coins": coins, "resolved": true }});

    var memo = "Thank you for buying this image";
    switch (language_preference) {
      case "Spanish":
        memo = "Gracias por comprar esta imagen";
        break;
    }

    let response = {
      PaymentAck: {
        status: "ok",
        id: id,
        return_url: "https://bitcoin-e.org/static/images/test/product_art_asking.jpg",
        memo: memo
      }
    };
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(response));
  });

  app.listen(3000, function() {
    console.log('Listening on port 3000...')
  });
})

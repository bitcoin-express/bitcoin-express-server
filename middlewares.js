var { authentication } = require("./config.json");

var authGETReqs = ["/getTransactions", "/getBalance"];

exports.authMiddleware = function (req, res, next) {
  if (req.method == "GET" && authGETReqs.some(str => str.startsWith(req.originalUrl))) {
    next();
    return;
  }

  var auth;
  if (req.method == "GET") {
    auth = req.query.auth;
  }
  if (req.method == "POST") {
    auth = req.body.auth;
    delete req.body.auth;
  }

  if (!auth || authentication != auth) {
    res.status(400).send("Incorrect authentication");
    return;
  }
  next();
} 

exports.corsMiddleware = function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
}

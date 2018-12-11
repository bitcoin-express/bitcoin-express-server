const db = require('./db');
const authReqs = [ '/register', '/payment', '/panel', ];


exports.authMiddleware = function (req, res, next) {
  var url = req.originalUrl;

  if (url == "/" || authReqs.some(str => url.startsWith(str))) {
    return next();
  }

  // TODO: new API: add other methods
  var auth;
  if (req.method == "GET") {
    auth = req.query.auth;
  }
  else if (req.method == "POST") {
    auth = req.body.auth;
    delete req.body.auth;
  }

  if (!auth) {
    res.status(401).send("No auth token provided");
    return;
  }

  db.findOne("accounts", { authToken: auth }).then((resp) => { 
    if (!resp) {
      res.status(400).send("No account with this auth token");
      return;
    }

    var id = resp._id;
    delete resp.privateKey;
    delete resp.authToken;
    delete resp.id;

    if (req.method == "GET") {
      req.query.account_id = id;
      req.query.account = resp;
    }

    if (req.method == "POST") {
      req.body.account_id = id;
      req.body.account = resp;
    }
    
    next();
  });
} 

exports.corsMiddleware = function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
}

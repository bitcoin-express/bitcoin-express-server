# Extract Coins

Set configuration options.

**URL** : `/setConfig`

**Method** : `POST`

**Auth required** : YES

**Permissions required** : None

**Data constraints**

Provide the basic information for the extraction.

```json
{
  "acceptable_issuers": "array<string> - A comma separated list of Issuer domains whose Coins are acceptable (e.g. [(eu.carrotpay.com), bitex.com])",
  "auth": "string (required) - the auth token",
  "createAuthToken": "boolean - request the Wallet to create a new account and to store the authentication token in an 'auth' element in the config file. If 'auth' already exists, this setting is ignored",
  "default_payment_currency": "string - the default currency of payments (e.g. 'XBT')",
  "default_payment_timeout": "string - the period (in seconds) that a payment request is valid when expires parameter is not set",
  "domain": "string - the domain of this Merchant (e.g. 'seller.com')",
  "home_issuer": "string - the domain of this Merchant's Home Issuer (e.g. 'eu.carrotpay.com')",
  "email_customer_contact": "string - the Merchant's contact email address. The configuration value may be overridden by passing a 'email.contact' element in the parameter to /createPaymentRequest",
  "provide_receipt_via_email": "boolean - a boolean to indicate if the buyer may expect a payment receipt, upon the occasion of providing an email address during payment",
  "provide_refund_via_email": "boolean - to indicate if the buyer may expect the possibility of a refund",
  "encryptCoins": "boolean - indicate if the Wallet should encrypt Coins while they are stored in the database",
}
```

**Data example** **auth** must be sent.

```json
{
  "default_payment_currency": "XBT",
  "auth": "<auth token>"
}
```

## Success Response

**Condition** : If everything is OK, returns the updated configuration JSON object. If only sent the auth token, returns the actual configuration JSON object.

**Code** : `200 OK`

**Content example**

```json
{
  "domain": "store.com",
  "home_issuer": "be.ap.rmp.net",
  "acceptable_issuers": [
    "eu.carrotpay.com",
    "be.ap.rmp.net"
  ],
  "default_payment_timeout": 3600,
  "default_payment_currency": "XBT",
  "provide_receipt_via_email": true,
  "provide_refund_via_email": true
}
```

## Error Responses

**Condition** : Wrong body parameters or incorrect auth token.

**Code** : `400 BAD REQUEST`

**Headers** : `https://testserver/setConfig

**Content** : `string`

**Content example**

```json
Not modified, account not found
```

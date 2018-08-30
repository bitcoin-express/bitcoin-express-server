# Get the the list of payment requests transactions.

**URL** : `/getTransactions`

**Method** : `GET`

**Auth required** : NO

**Permissions required** : None

**Query parameters**

None.

## Success Response

**Condition** : If everything is OK the list of transactions stored in the DB.

**Code** : `200 OK`

**Content example**

For each transaction successfully paid, the value of the *resolved* parameter is set to true.

```json
{
  "result": [
    {
      "_id":"5b7efac7cc06021070bad4bb",
      "amount":0.0000095,
      "currency":"XBT",
      "issuers":["be.ap.rmp.net","eu.carrotpay.com"],
      "memo":"The art of asking",
      "return_url":"http://amandapalmer.net/wp-content/themes/afp/art-of-asking/images/hero_mask.png",
      "return_memo":"Thank you for buying this image",
      "email": {
        "contact":"sales@merchant.com",
        "receipt":true,
        "refund":false
      },
      "payment_id":"206cfea0-a701-11e8-913a-0184e0e82a69",
      "payment_url":"https://localhost:8443/payment",
      "expires":"2018-08-23T18:23:51.561Z",
      "language_preference":"English",
      "resolved":false,
      "time":"2018-08-23T18:23:51.561Z"
    },
    {
      "_id":"5b54efd5d7a4fe47cd65a924",
      "amount":0.0000095,
      "currency":"XBT",
      "issuers":["be.ap.rmp.net","eu.carrotpay.com"],
      "memo":"The art of asking",
      "email":{
        "contact":"sales@merchant.com",
        "receipt":true,
        "refund":false
      },
      "payment_id":"926s8ea0-5701-31e8-e1ea-ee84e4444a69",
      "payment_url":"https://localhost:8443/payment",
      "expires":"2018-07-22T21:01:57.457Z",
      "resolved":false,
      "time":"2018-07-22T20:57:57.457Z"
    }
  ]
}
```

## Error Responses

**Condition** : Wrong setup of the database.

**Code** : `400 BAD REQUEST`

**Headers** : `https://testserver/getTransactions`

**Content** : `string`

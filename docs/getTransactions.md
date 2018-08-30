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
      "_id": "5b54e119d7a4fe47cd65a923",
      "amount": 0.0000095,
      "payment_url": "https://localhost:8443/payment",
      "currency": "XBT",
      "issuers": ["be.ap.rmp.net","eu.carrotpay.com"],
      "memo": "The art of asking",
      "email": {
        "contact":"sales@merchant.com",
        "receipt":true,
        "refund":false
      },
      "resolved":true,
      "time":"2018-07-22T19:55:05.700Z",
      "expires":"2018-07-22T19:59:05.700Z",
      "key":"theartofasking",
      "paymnet_id":"df1b7faa-34e6-a25e-417d-5d3a4a683102"
    },
    {
      "_id":"5b54efd5d7a4fe47cd65a924",
      "amount":0.0000095,
      "payment_url":"https://localhost:8443/payment",
      "currency":"XBT",
      "issuers":["be.ap.rmp.net","eu.carrotpay.com"],
      "memo":"The art of asking",
      "email":{
        "contact":"sales@merchant.com",
        "receipt":true,
        "refund":false
      },
      "resolved":false,
      "time":"2018-07-22T20:57:57.457Z",
      "expires":"2018-07-22T21:01:57.457Z",
      "key":"theartofasking"
    }
  ]
}
```

## Error Responses

**Condition** : Wrong setup of the database.

**Code** : `400 BAD REQUEST`

**Headers** : `https://testserver/getTransactions`

**Content** : `string`

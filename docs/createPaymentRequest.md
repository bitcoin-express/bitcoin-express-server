# Create a new Payment Request

Create a payment request that will be used by the Bitcoin-Express wallet to display the initial payment information.

**URL** : `/createPaymentRequest`

**Method** : `POST`

**Auth required** : YES

**Permissions required** : None

**Data constraints**

Provide the Payment basic information.

```json

{
    "ack_memo": "string - purchase information stored and displayed at the wallet's item section",
    "amount": "float (required) - amount of the payment",
    "auth": "string (required) - authentication code",
    "currency": "string - valid currency for this payment. If not set, it will use the default merchant_config.default_payment_currency",
    "email": {
      "contact": "string - contact email of the merchat",
      "receipt": "boolean - send receipt to users after payment",
      "refund": "boolean - refunds allowed"
    },
    "expires": "string - seconds from now when the payment must expire. If not set by default expires will be set from the value of merchant_config.default_payment_timeout",
    "issuers": "array[string] - list of acceptable issuers",
    "memo": "string (required) - short description of the item, preferably in the buyer's preferred language",
    "merchant_data": "string - typically a reference that is meaningful to the merchant – for example an invoice number",
    "return_url": "string - the url returned when the payment is successful, when the item is a link to the product. Otherwise the return_url will be set as: 'domain: ' + merchant_config.domain",
}
```

**Data example** "auth", "amount" and "memo" fields are required and must be sent.

```json
{
    "ack_memo": "Success paid for 'The art of asking'",
    "amount": 0.0000095,
    "auth": "dummy_password",
    "currency": "XBT",
    "issuers": ["be.ap.rmp.net", "eu.carrotpay.com"],
    "memo": "The art of asking",
    "return_url": "http://myawesomeitem.com/123",
}
```

## Success Response

**Condition** : If everything is OK the Payment Request to be used by the Bitcoin-express wallet.

**Code** : `200 OK`

**Content example**

```json
{
  "amount": 0.0000095,
  "currency": "XBT",
  "issuers": ["be.ap.rmp.net","eu.carrotpay.com"],
  "memo": "The art of asking",
  "email":{
    "contact": "sales@merchant.com",
    "receipt": true,
    "refund": false
  },
  "payment_id": "97e00590-aa8a-11e8-a18f-4d64691098e6",
  "payment_url": "https://testserver/pay",
  "expires": "2018-08-28T06:25:26.505Z"
}
```

## Error Responses

**Condition** : Wrong body parameters or incorrect authentication.

**Code** : `400 BAD REQUEST`

**Headers** : `https://testserver/createPaymentRequest`

**Content** : `string`

**Content example**

```json
Incorrect amount
```

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
    "amount": "float - amount of the payment",
    "currency": "string - valid currency for this payment",
    "issuers": "array - list of acceptable issuers",
    "memo": "string - short description of the item",
    "email": {
      "contact": "string - contact email of the merchat",
      "receipt": "boolean - send receipt to users after payment",
      "refund": "boolean - refunds allowed"
    },
    "authentication": "string - authentication code",
}
```

**Data example** All fields must be sent.

```json
{
    "amount": 0.0000095,
    "currency": "XBT",
    "issuers": ["be.ap.rmp.net", "eu.carrotpay.com"],
    "memo": "The art of asking",
    "email": {
      "contact": "sales@merchant.com",
      "receipt": true,
      "refund": false
    },
    "authentication": "dummy_password",
}
```

## Success Response

**Condition** : If everything is OK the Payment Request to be used by the Bitcoin-express wallet.

**Code** : `200 OK`

**Content example**

```json
{
  "amount":0.0000095,
  "currency":"XBT",
  "issuers":["be.ap.rmp.net","eu.carrotpay.com"],
  "memo":"The art of asking",
  "email":{
    "contact":"sales@merchant.com",
    "receipt":true,
    "refund":false
   },
   "payment_id":"97e00590-aa8a-11e8-a18f-4d64691098e6",
   "payment_url":"http://18.130.120.182:8080/pay",
   "expires":"2018-08-28T06:25:26.505Z",
   "language_preference":"english"
}
```

## Error Responses

**Condition** : If Account already exists for User.

**Code** : `400 BAD REQUEST`

**Headers** : `https://testserver/createPaymentRequest`

**Content** : `string`

**Content example**

```json
Incorrect amount
```

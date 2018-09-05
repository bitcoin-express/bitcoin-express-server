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
    "amount": "float (required) - amount of the payment",
    "memo": "string (required) - short description of the item, preferably in the buyer's preferred language",
    "return_url": "string (required) - valid currency for this payment",
    "issuers": "array[string] - list of acceptable issuers",
    "expires": "string - seconds from now when the payment must expire",
    "currency": "string - valid currency for this payment",
    "merchant_data": "string - typically a reference that is meaningful to the merchant – for example an invoice number",
    "email": {
      "contact": "string - contact email of the merchat",
      "receipt": "boolean - send receipt to users after payment",
      "refund": "boolean - refunds allowed"
    },
    "auth": "string - authentication code",
}
```

**Data example** "return_url", "amount" and "memo" fields are required and must be sent.

```json
{
    "amount": 0.0000095,
    "return_url": "http://myawesomeitem.com/123",
    "currency": "XBT",
    "issuers": ["be.ap.rmp.net", "eu.carrotpay.com"],
    "memo": "The art of asking",
    "auth": "dummy_password",
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

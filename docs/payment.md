# Proceed with the payment

Confirm a *payment_id* by sending the coins which value must be the same or higher than the payment *amount*.

**URL** : `/payment`

**Method** : `POST`

**Auth required** : YES

**Permissions required** : None

**Data constraints**

Provide the payment identification and the list of coins.

```json

{
   "coins": "array(string) - list of coins",
   "language_preference": "string - language of preference",
   "payment_id": "string - id of a payment already created",
   "return_url": "string - if payment completed, the page will redirect to the retur_url",
   "return_memo": "string - othe data/info to return if payment succeded"
}
```

**Data example** All fields must be sent.

```json
{
   "coins": ["0esdfwern302234b22o4jk2hit3oh89fwh2n2+wo24o324"],
   "language_preference": "spanish",
   "payment_id": "kj3248-k2mn88,
   "return_url": "https://myawesomevideo.com/928371",
   "return_memo": "Thank you for your purchase!!"
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

**Condition** : Wrong body parameters or incorrect authentication.

**Code** : `400 BAD REQUEST`

**Headers** : `https://testserver/createPaymentRequest`

**Content** : `string`

**Content example**

```json
Incorrect amount
```

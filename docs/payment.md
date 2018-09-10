# Proceed with the payment

Confirm a *payment_id* by sending the coins which value must be the same or higher than the payment *amount*.

**URL** : `/payment`

**Method** : `POST`

**Auth required** : NO

**Permissions required** : None

**Data constraints**

Provide the payment identification and the list of coins.

```json
{
  "id": "string - created by the Wallet and echoed back to the Wallet in the PaymentAck",
  "client": "string - either 'web' or 'app'"
  "coins": "array(string) - list of coins",
  "language_preference": "string - language of preference",
  "merchant_data": "string - if present, the paymentRequest MUST be echoed here",
  "payment_id": "string - if present, the paymentRequest MUST be echoed here",
  "memo": "string - short message from buyer to merchant - could include the buyer's postal address..."
}
```

**Data example** The field *coins* and *payment_id* or *merchant_data* must be sent.

```json
{
  "coins": ["0esdfwern302234b22o4...jk2hit3oh89fwh2n2+wo24o324"],
  "client": "web",
  "id": "12344321",
  "receipt_to": {
    "email": "buyer@mail.com"
  },
  "refund_to": {
    "email": "buyer@mail.com",
    "password": "hX,LsQ9z",
    "reference": "12344321"
  },
  "payment_id": "97e00590-aa8a-...d64691098e6",
  "merchant_data": "inv1234",
  "language_preference": "en_GB",
  "memo": "123 Street, Town, City, Country",
}
```

## Success Response

**Condition** : If everything is OK, the Payment Ack confirming the completition of the payment including the return_url.

**Code** : `200 OK`

**Content example**

```json

{
  "PaymentAck": {
    "status": "ok",
    "id": "kj3248-k2mn88",
    "return_url": "https://myawesomevideo.com/928371",
  }
}
```

## Error Responses

**Condition** : Wrong body parameters or incorrect amount of coins.

**Code** : `400 BAD REQUEST`

**Headers** : `https://testserver/payment

**Content** : `string`

**Content example**

```json
No coins included
```

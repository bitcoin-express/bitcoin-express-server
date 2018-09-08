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
   "id": "string - a string created by the Wallet and echoed back to the Wallet in the PaymentAck",
   "coins": "array(string) - list of coins",
   "client": "string - either 'web' or 'app' [default to 'web']",
   "merchant_data": "string - if present in the paymentRequest, it MUST be echoed here",
   "payment_id": "string - id of a payment already created",
   "return_url": "string - if payment completed, the page will redirect to the retur_url",
   "receipt_to": "string - where a receipt should be sent if the Merchant is able to provide one",
   "refund_to": "string - othe data/info to return if payment succeded",
   "language_preference": "string - language of preference",
   "memo": "string - a short message from the buyer to the Merchant (could include the buyer's postal address...)"
}
```

**Data example** Key fields *coins*, *payment_id*/*merchant_data* and *id* must be sent.

```json
{
   "id": "di3isne",
   "coins": ["0esdfwern302234b22o4jk2hit3oh89fwh2n2+wo24o324"],
   "payment_id": "kj3248-k2mn88",
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
    "return_url": "https://myawesomevideo.com/928371"
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

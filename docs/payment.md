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
   "payment_id": "kj3248-k2mn88",
   "return_url": "https://myawesomevideo.com/928371",
   "return_memo": "Thank you for your purchase!!"
}
```

## Success Response

**Condition** : If everything is OK the Payment Ack confirming the completition of the payment including the return_url.

**Code** : `200 OK`

**Content example**

```json

{
  PaymentAck: {
    "status": "ok",
    "id": "kj3248-k2mn88",
    "return_url": "https://myawesomevideo.com/928371",
    "return_memo": "Thank you for your purchase!!"
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

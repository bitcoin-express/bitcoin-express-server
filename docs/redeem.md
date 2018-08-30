# Redeem coins to a Bitcoin address

Send the requested amount to a Bitcoin address, following the [Bitcoin URL scheme](https://en.bitcoin.it/wiki/BIP_0021).

**URL** : `/redeem`

**Method** : `POST`

**Auth required** : YES

**Permissions required** : None

**Data constraints**

Provide the Payment basic information.

```json

{
    "amount": "float - amount to be sent",
    "address": "string - valid bitcoin address",
    "speed": "string - describes the speed of the transaction, the faster the higher the fees are",
    "message": "string - message that describes the transaction to the user",
    "label": "string - label for that address (e.g. name of receiver)",
}
```

**Data example** All fields must be sent.

```json
{
    "amount":0.0000095,
    "address":"35hQUijzi3QnwxCbmXpLqN4hyqGV2hgot5",
    "speed": "fastest",
    "message": "resquested amount for my friend Satoshi",
    "label": "satoshi",
}
```

## Success Response

**Condition** : If everything is OK the confirmation of the success.

**Code** : `200 OK`

**Content example**

```json
{
    "status": "ok",
}
```

## Error Responses

**Condition** : Wrong body parameters or incorrect authentication.

**Code** : `400 BAD REQUEST`

**Headers** : `https://testserver/redeem`

**Content** : `string`

**Content example**

```json
Incorrect Bitcoin address
```

# Extract Coins

Extract Coins in the standard file format so that they may easily be imported into Bitcoin-Express wallet.

**URL** : `/getCoins`

**Method** : `POST`

**Auth required** : YES

**Permissions required** : None

**Data constraints**

Provide the basic information for the extraction.

```json
{
  "amount": "float - the amount to be extracted",
  "currency": "string - Coins currency to be extracted",
  "password": "string - if included, the coins will be encrypted with this password",
  "memo": "string - a descriptive text of the widthdrawal",
  "auth": "string - the auth token"
}
```

**Data example** **auth**, **amount** and **currency** must be sent.

```json
{
  "amount": 0.5,
  "currency": "XBT",
  "password": "hardtoguess",
  "memo": "2019 July sales",
  "auth": "<auth token>"
}
```

## Success Response

**Condition** : If everything is OK, the Coin with the exact requested amount JSON representation following the Bitcoin-Express wallet's format.

**Code** : `200 OK`

**Content example**

```json
{
  "fileType": "export",
  "date": "2019-07-01T13:51:51.348Z",
  "sender": "<merchant's domain>|<account name>",
  "reference": "<_id>",
  "memo": "2019 July sales",
  "contents": ["XBT 0.5"],
  "coins": {
    "encrypted": true,
    "iv": "DvTCr7M6eUB3QvuMr1RIbQ==",
    "coins": {
      "XBT": [
        "gJ9YJx/DLOs44/Chfy6G ... aDmLlT2LaW82fCk3r7Tya8VQby/byaBkI+Viix1qd/KiU5yyU=",
        "gJ9YJx/DLOs44/Chfy6GAK6GaBa7+TZJNEL5EME0witUDrd ... p3uMR/yqFZWsE++9Du/hPo="
      ]
    }
  }
}
```

## Error Responses

**Condition** : Wrong body parameters or incorrect amount of coins.

**Code** : `400 BAD REQUEST`

**Headers** : `https://testserver/getCoins

**Content** : `string`

**Content example**

```json
Not enough funds
```

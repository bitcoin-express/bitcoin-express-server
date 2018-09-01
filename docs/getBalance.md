# Get total balance

Get the sum of the coins values stored from all the payments in the merchant wallet server.

**URL** : `/getBalance`

**Method** : `GET`

**Auth required** : NO

**Permissions required** : None

**Query parameters**

- A *currency* indicating if we want to retrieve only the balance of one currency.

**Query example**

```json
?currency=XBT
```

## Success Response

**Condition** : If everything is OK the total stored balance for each currency and the number of coins.

**Code** : `200 OK`

**Content example**

```json
[
  {
    "currency": "ETH",
    "total": 0.0019350,
    "numCoins": 22
  }, {
    "currency": "XBT",
    "total": 0.0001295,
    "numCoins": 12
  }
]
```

## Error Responses

**Condition** : Wrong setup of the database.

**Code** : `400 BAD REQUEST`

**Headers** : `https://testserver/getBalance`

**Content** : `string`

# Get total balance

Get the sum of the coins values stored from all the payments in the merchant wallet server.

**URL** : `/getBalance`

**Method** : `GET`

**Auth required** : YES

**Permissions required** : None

**Query parameters**

- An *auth* [required] string token that matches with the merchant's account.
- A *currency* [optional] indicating if we want to retrieve only the balance of one currency.

**Query example**

```json
?auth=<auth token>&currency=<XBT,ETH,BCH,USD,GBP,EUR>
```

## Success Response

**Condition** : If everything is OK, a list with the total stored balance for each currency and the number of coins.
If currency query string is not set, returns the list of all the currencies with coins included by payments for the merchant.
If the currency query string set is a fiat ("USD", "EUR", "GBP"), returns all the crypto currencies values plus the fiat value from all the coins.

**Code** : `200 OK`

**Content example**

```json
[
  {
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

# Get total balance

Get the sum of the coins values stored from all the payments in the merchant wallet server.

**URL** : `/getBalance`

**Method** : `GET`

**Auth required** : NO

**Permissions required** : None

**Query parameters**

Any.


## Success Response

**Condition** : If everything is OK the total balance of the wallet.

**Code** : `200 OK`

**Content example**

```json
{
  "total": 0.0001295
}
```

## Error Responses

**Condition** : Wrong setup of the database.

**Code** : `400 BAD REQUEST`

**Headers** : `https://testserver/getBalance`

**Content** : `string`

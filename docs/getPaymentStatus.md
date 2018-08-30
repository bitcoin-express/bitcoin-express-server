# Get the status of a created payment request.

**URL** : `/getPaymentStatus`

**Method** : `GET`

**Auth required** : NO

**Permissions required** : None

**Query parameters**

A *queryField* indicating if we want to retrieve the payment request by searching the "payment_id" or the "merchant_data".
A *queryData* indicating the vaule of the query field.

**Query example**

All parameters must be included.

```json
/queryField=payment_id&queryData=83j372hd-wkweht78
```

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

**Condition** : Wrong setup of the database or wrong query parameters.

**Code** : `400 BAD REQUEST`

**Headers** : `https://testserver/getPaymentStatus`

**Content** : `string`

**Content example**

```json
Wrong queryField
```

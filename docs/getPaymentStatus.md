# Get the status of a created payment request.

**URL** : `/getPaymentStatus`

**Method** : `GET`

**Auth required** : YES

**Permissions required** : None

**Query parameters**

- A *auth* [required] authentication code.
- A *queryData* [required] indicating the vaule of the query field.
- A *queryField* [required] indicating if we want to retrieve the payment request by searching the "payment_id" or the "merchant_data".

**Query example**

All parameters must be included.

```json
?auth=<auth token>&queryField=<payment_id, merchant_data>&queryData=<query field's value>
```

## Success Response

**Condition** : If everything is OK the status of the requested payment.

**Code** : `200 OK`

**Content example**

```json
{
  "_id":"5b7efac7cc06021070bad4bb",
  "amount":0.0000095,
  "currency":"XBT",
  "issuers":["be.ap.rmp.net","eu.carrotpay.com"],
  "memo":"The art of asking",
  "return_url":"http://amandapalmer.net/wp-content/themes/afp/art-of-asking/images/hero_mask.png",
  "return_memo":"Thank you for buying this image",
  "email": {
    "contact":"sales@merchant.com",
    "receipt":true,
    "refund":false
  },
  "payment_id":"206cfea0-a701-11e8-913a-0184e0e82a69",
  "payment_url":"https://localhost:8443/payment",
  "expires":"2018-08-23T18:23:51.561Z",
  "language_preference":"English",
  "resolved":false,
  "time":"2018-08-23T18:23:51.561Z"
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

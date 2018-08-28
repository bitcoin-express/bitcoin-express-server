# Create a new Payment Request

Create a payment request that will be used by the Bitcoin-Express wallet to display the initial payment information.

**URL** : `/createPaymentRequest`

**Method** : `POST`

**Auth required** : YES

**Permissions required** : None

**Data constraints**

Provide the Payment basic information.

```json

{
    "amount": "float - amount of the payment",
    "currency": "string - valid currency for this payment",
    "issuers": "array - list of acceptable issuers",
    "memo": "string - short description of the item",
    "email": {
      contact: "",
      receipt: "",
      refund: ""
    },
    "authentication": "",
}
```

**Data example** All fields must be sent.

```json
{
    "amount": 0.0000095,
    "currency": "XBT",
    "issuers": ["be.ap.rmp.net", "eu.carrotpay.com"],
    "memo": "The art of asking",
    "email": {
      "contact": "sales@merchant.com",
      "receipt": true,
      "refund": false
    },
    "authentication": "dummy_password",
}
```

## Success Response

**Condition** : If everything is OK and an Account didn't exist for this User.

**Code** : `201 CREATED`

**Content example**

```json
{
    "id": 123,
    "name": "Build something project dot com",
    "url": "http://testserver/api/accounts/123/"
}
```

## Error Responses

**Condition** : If Account already exists for User.

**Code** : `303 SEE OTHER`

**Headers** : `Location: http://testserver/api/accounts/123/`

**Content** : `{}`

### Or

**Condition** : If fields are missed.

**Code** : `400 BAD REQUEST`

**Content example**

```json
{
    "name": [
        "This field is required."
    ]
}
```

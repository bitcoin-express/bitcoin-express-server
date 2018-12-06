# Create a new account

Create a new account to store payments.

**URL** : `/register`

**Method** : `POST`

**Auth required** : NO

**Permissions required** : None

**Data constraints**

Provide the basic information for the extraction.

```json
{
  "domain": "string - Coins currency to be extracted",
  "email": "string - if included, the coins will be encrypted with this password",
  "name": "string - a descriptive text of the widthdrawal"
}
```

**Data example** **domain** must be sent.

```json
{
  "domain": "mysite.com"
}
```

## Success Response

**Condition** : If everything is OK, the new account info including the **authToken**.

**Code** : `200 OK`

**Content example**

```json
{
   "authToken": "3ZmSnYiLAog",
   "domain": " mySite.com ",
   "emailAccountContact": " sales@mySite.com ",
   "name": "Clothing",
   "homeIssuer": "eu.carrotpay.com",
   "acceptableIssuers": "[(eu.carrotpay.com)]",
   "default_payment_timeout": "3600",
   "emailCustomerContact": "",
   "offerEmailReceipt": false,
   "offerEmailRefund": false,
   "paymentPath": "/"
}
```

## Error Responses

**Condition** : Wrong body parameters or incorrect amount of coins.

**Code** : `400 BAD REQUEST`

**Headers** : `https://testserver/register

**Content** : `string`

**Content example**

```json
domain not included
```

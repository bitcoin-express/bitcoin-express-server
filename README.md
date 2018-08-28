# API

This Merchant Wallet API example runs in the merchant's own server environment with optional authentication by means of using the config.json file. It stores coins, creates/stores payment requests and provides a service to retrieve the balance and redeem saved coins to a Bitcoin address. It **MUST** be private and **NOT PUBLIC** (accessible from Internet).

## Open endpoints

The following endpoints does not require authentication.

| HTTP Method        | URL           | Description  |
| ------------- |-------------| -----|
| GET | [/getBalance](docs/getBalance.md) | Retrieves the sum of the coin values from the wallet |
| GET | [/getPaymentStatus?queryField=XXX&queryData=YYY](docs/getPaymentStatus.md) | Retrieves a specific location object by payment_id or merchant_data |
| GET | [/getTransactions](docs/getTransactions.md) | Retrieves the whole list of transactions from the DB |

## Endpoints that require Authentication

Closed endpoints require the valid authentication string included in the body request. It will be valid if the string is the same as the *authentication* value from the **config.json** file.

| HTTP Method        | URL           | Description  |
| ------------- |-------------| -----|
| POST | [/createPaymentRequest](docs/createPaymentRequest.md) | Creates and stores in DB a new paymentRequest, and returns the paymentRequest |
| POST | [/payment](docs/payment.md) | Proceed with the payment by checking the validity of the coins, storing them and returning the payment result. |
| POST | [/redeem](docs/redeem.md) | Sends funds from the wallet to a Bitcoin address |


# Installation

Instructions for Linux OS. For the rest of operating systems soon will update with instructions.

## Requirements

- Already installed nodejs and npm in the server.
- Secure certificate and key located at sslcert folder to allow HTTPS access to the server. More information at the sslcert folder.

## Steps

### 1. Install dependencies

> npm install


### 2. Install MongoDB

[instructions](https://docs.mongodb.com/manual/installation/)

> sudo apt-get install -y mongodb
> mongo


### 3. Connect to DB

From the terminal, open mongodb shell:

> mongo bitcoin-express

After you are connected, you can display the list of payments and retrieve the coins in the shell ('payments' table must be in the list):

> show collections

Display all the payments recorded:

> db.payments.find()

Display all the coins collected from payments:

> db.payments.find({}, {"coins": 1})


### 4. Run the server API

> node app.js


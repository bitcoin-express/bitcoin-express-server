# API

This Merchant Public Server communicates privately and internally with the merchant wallet in order to proceed/retrieve payment requests.

## URLS

The following endpoints does not require authentication.

| HTTP Method        | URL           | Description  |
| ------------- |-------------| -----|
| GET | / | Returns merchant website sample with a Bitcoin-express payment connected to the merchant server |
| GET | /panel | (to be done: show stats, list of transactions, etc.) |


# Installation

## Requirements

- Already installed nodejs and npm in the server.
- Run the app.js server API in local.

## Steps

### 1. Install dependencies

> npm install

### 2. Run the server API

> node merchant.js

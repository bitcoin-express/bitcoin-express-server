Instructions for Linux OS. For the rest of operating systems soon will update with instructions.

# Requirements

- Already installed nodejs and npm in the server.
- Secure certificate and key located at sslcert folder to allow HTTPS access to the server. More information at the sslcert folder.

# 1. INSTALL DEPENDENCIES

> npm install


# 2. INSTALL MONGO

[instructions](https://docs.mongodb.com/manual/installation/)

> sudo apt-get install -y mongodb
> mongo


# 3. CONNECT TO DB

From the terminal, open mongodb shell:

> mongo bitcoin-express

After you are connected, you can display the list of payments and retrieve the coins in the shell ('payments' table must be in the list):

> show collections

Display all the payments recorded:

> db.payments.find()

Display all the coins collected from payments:

> db.payments.find({}, {"coins": 1})


# 4. RUN SERVER

> node app.js


> openssl genrsa -des3 -out bitcoinexpress.key 1024
> openssl req -new -key bitcoinexpress.key -out bitcoinexpress.csr
> openssl x509 -req -days 365 -in bitcoinexpress.csr -signkey bitcoinexpress.key -out bitcoinexpress.crt

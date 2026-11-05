# BC2 Connect protocol

BC2 Connect accepts only versioned requests for `https://bc2market.com`, the pinned BitcoinII network identifier, and the fixed verification callback. Requests include a random identifier, explicit message, and short expiry.

After user authentication, GoldWallet signs the displayed login message with the selected public address and sends the address and signature to the callback. The recovery phrase and private key never leave the device. A connection proof authenticates control of an address; it does not approve spending or grant background signing authority.

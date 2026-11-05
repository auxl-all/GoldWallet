# Electrum and network verification

GoldWallet defaults to `wss://electrum.bc2market.com` and also supports a user-selected TLS Electrum endpoint. It identifies the client with `server.version`, reads server features, and requires the BitcoinII Mainnet genesis hash:

`0000000028f062b221c1a8a5cf0244b1627315f7aa5b775b931cfec46dc17ceb`

Electrum servers receive script-hash queries and can observe wallet-related metadata. They do not receive the recovery phrase or private key. A malicious server can censor, delay, or lie about unverified data; genesis pinning does not make the server trusted. Users who require stronger privacy should operate and select their own server.

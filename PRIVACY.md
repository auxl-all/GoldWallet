# Privacy

GoldWallet is non-custodial. Recovery words and private keys are generated, encrypted, and used on the user's device. BC2 Market does not receive them.

To synchronize the wallet, the selected Electrum server receives the wallet's script hash and blockchain requests. A server can associate requests with an IP address and infer activity for queried addresses. Users may configure another compatible TLS Electrum server.

BC2 Connect sends the selected public address and a signature over a short-lived, origin-bound message to `bc2market.com`. It does not send the recovery phrase or private key.

The app requests network access, notifications, biometrics, and camera/QR capabilities for their visible wallet functions. It does not require contacts, location, microphone, SMS, or advertising identifiers. No analytics SDK is intentionally included in the wallet repository.

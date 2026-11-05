# Architecture

GoldWallet has two auditable layers:

1. `wallet-web/src` implements key derivation, encrypted local storage, address validation, transaction construction, Electrum communication, QR routing, and BC2 Connect message verification.
2. `app/src/main/java` provides the Android WebView shell, Android Keystore-backed biometric protection, QR scanning, TLS Electrum transport, notification delivery, and external-link restrictions.

Generated web assets are copied into `app/src/main/assets/wallet` and loaded through Android's local asset origin. Mainnet wallet operations do not require a BC2 Market account.

The wallet derives one BIP84 Mainnet receive path, verifies the BitcoinII genesis hash, constructs replay-protected transactions locally, requests user authentication, and broadcasts only the signed raw transaction.

# Threat model

## Assets

- Recovery words and derived private keys
- Encrypted vault and biometric wrapping key
- Recipient, amount, fee, and change details
- Authenticity of the installed APK and network responses

## Defended threats

- Accidental screenshots of sensitive screens
- Reading a vault without its password or enrolled device authentication
- Connecting to an Electrum server for another chain
- Untrusted external navigation from the wallet WebView
- Modified or expired BC2 Connect requests
- Invalid BitcoinII recipient addresses

## Residual risks

- Malware, root access, accessibility abuse, or a compromised Android OS
- Clipboard substitution and social engineering
- Electrum metadata correlation and server availability
- A lost recovery phrase, weak wallet password, or compromised signing/build infrastructure
- Implementation defects not yet found by an independent audit

GoldWallet is not a hardware wallet and does not claim protection against a fully compromised device.

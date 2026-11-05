# GoldWallet for BitcoinII

GoldWallet is a non-custodial Android hot wallet for BitcoinII Mainnet. This repository contains both the native Android shell and the unminified wallet source used to generate the bundled web assets.

## Trust boundary

- Recovery words and private keys remain on the device.
- The encrypted vault uses PBKDF2-SHA256 and AES-256-GCM.
- BitcoinII Mainnet genesis is pinned and checked on Electrum connections.
- Transactions are assembled and signed locally before broadcast.
- BC2 Connect signs an expiring login message; it does not expose wallet keys or authorize a transaction.
- This is a hot wallet. Use small balances until an independent audit is complete.

See [Architecture](docs/ARCHITECTURE.md), [Threat model](docs/THREAT_MODEL.md), [Privacy](PRIVACY.md), and [Security policy](SECURITY.md).

## Build from source

Prerequisites: JDK 17, Android SDK 35, and Node.js 22.

```text
cd wallet-web
npm ci
npm test
cd ..
node scripts/sync-wallet-assets.mjs
node scripts/verify-native.mjs
gradlew.bat testDebugUnitTest assembleDebug
```

Linux and macOS users should run `./gradlew` instead of `gradlew.bat`. Configure the local Android SDK path in untracked `local.properties`.

## Verify a release

Each release must publish the source tag, commit, APK SHA-256, Android signing-certificate SHA-256, build inputs, and security status. Follow [BUILD.md](BUILD.md) and [REPRODUCIBLE_BUILD.md](REPRODUCIBLE_BUILD.md).

The current `0.4.7` artifact is a testing build signed by an Android debug certificate. It is not a production-signed release. Back up the 12 recovery words before moving to a future production-signed APK because Android will not install an APK signed by a different key over the debug build.

## License

Code is released under the [MIT License](LICENSE). BC2 Market and GoldWallet names and logos are not granted by that license; see [TRADEMARKS.md](TRADEMARKS.md).

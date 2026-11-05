# Build and release inputs

## Required tools

- JDK 17
- Android SDK 35 and Build Tools 35.0.0
- Node.js 22 with npm
- Gradle wrapper committed in this repository

## Clean verification build

```text
cd wallet-web
npm ci
npm test
cd ..
node scripts/sync-wallet-assets.mjs
git diff --exit-code -- app/src/main/assets/wallet
node scripts/scan-secrets.mjs
node scripts/verify-native.mjs
gradlew.bat clean testDebugUnitTest assembleDebug
```

The wallet source of truth is `wallet-web/src`. Generated assets are committed under `app/src/main/assets/wallet` so reviewers can compare source and shipped content.

## Signing boundary

Do not put a release keystore or password in Git. Production signing must read protected credentials from an offline signing system or a restricted CI environment. Publish the release certificate, never the private key.

Before publication, run `apksigner verify --verbose --print-certs GoldWallet.apk`, record the certificate SHA-256, compute the APK SHA-256, and attach both values to the release.

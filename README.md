# BC2 Wallet Native Android

Native Android shell for the audited BC2 wallet core. It adds Android Keystore-backed fingerprint protection, secure system notifications, screenshot blocking and an Electrum TCP/TLS bridge while retaining WSS support.

Version 0.2 adds native QR scanning, a local recipient address book, redesigned wallet onboarding and authenticated BC2Market Mainnet connection proofs. The proof is a preview artifact, not yet a server-backed website session.

## Development build

1. Install JDK 17 and Android SDK 35.
2. Set `sdk.dir` in `local.properties`.
3. Run `gradlew.bat assembleDebug`.
4. Install `app/build/outputs/apk/debug/app-debug.apk` with ADB.

This first build is debug-signed and intended for device testing only. Create a protected release keystore and complete external security review before production distribution.

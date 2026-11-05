# Key management

The wallet creates a 12-word BIP39 recovery phrase on the device and derives BitcoinII keys locally. The phrase is encrypted with a password-derived key before storage. Optional biometric access wraps wallet material with an Android Keystore key requiring device authentication.

BC2 Market cannot recover a lost phrase and must never ask a user to disclose it. Users should record the phrase offline, verify the backup, and avoid screenshots or cloud notes.

Android application signing keys are separate from user wallet keys. The production signing key must be generated and retained outside the public repository, backed up securely, and used only for approved releases.

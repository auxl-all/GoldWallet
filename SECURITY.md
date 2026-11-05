# Security policy

GoldWallet handles keys that can authorize irreversible transactions. Do not include recovery words, private keys, live wallet files, or exploit details in a public issue.

Report suspected vulnerabilities privately to `contact@bc2market.com` with the affected version, impact, reproduction steps, and a safe proof of concept. BC2 Market will acknowledge a report, investigate it, and publish a security advisory after users have a reasonable opportunity to update.

## Supported status

The current `0.4.x` line is a testing release and has not completed an independent external audit. A production release must use a protected release signing key and publish its certificate fingerprint.

## Security expectations

- Never request or share a user's 12 recovery words.
- Never commit Android keystores, signing passwords, API credentials, or funded test wallets.
- Verify Mainnet genesis before accepting Electrum data.
- Require explicit user review and device authentication before signing a transaction.
- Treat BC2 Connect messages as authentication only, never as transaction approval.

## 0.4.8 — 2026-11-13

- Group Settings into expandable wallet backup, security, network, reports, notifications, about and removal sections.
- Add daily balance and cash-flow reports for 7/30/45/90 days or a custom UTC+7 date range.
- Load complete Electrum history with in-memory transaction caching; reconcile confirmed and pending balances before displaying totals.
- Exclude change from incoming/outgoing totals, account for network fees, and reject incomplete or ambiguous mixed-input histories.
- Export CSV through the Android document picker or browser download. No seed or private key is included.

# Changelog

## 0.4.7 — 2026-11-05

- Published the complete unminified wallet source and deterministic dependency lock.
- Added build verification, secret scanning, CI, architecture, privacy, and threat-model documentation.
- Removed an unused vulnerable test dependency.

## 0.4.6 — 2026-11-05

- Fixed the Electrum handshake used by background transaction notifications.
- Published wallet source, build instructions, security boundaries, and release-verification metadata.

## Security status

Version 0.4.6 remains a debug-signed testing build and has not received an independent external audit.

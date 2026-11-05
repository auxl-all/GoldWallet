# Reproducible-build verification

1. Check out the signed release tag.
2. Install exactly the versions in `wallet-web/package-lock.json` with `npm ci`.
3. Build and test the web wallet.
4. Synchronize generated assets and require a clean Git diff.
5. Build the Android release with the documented JDK and SDK versions.
6. Compare the unsigned APK contents and hashes with the published unsigned artifact.
7. Independently verify the official APK signature and certificate fingerprint.

The production signing key is intentionally unavailable to independent builders. Reproducibility therefore compares the unsigned build output, while authenticity of the distributed APK is checked separately with the published signing certificate.

Every release should include `release-manifest.json`, an SBOM, an unsigned APK, the signed APK, SHA-256 files, the signed Git tag, and CI build provenance.

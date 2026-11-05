import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const apk=process.argv[2];
assert.ok(apk,'Usage: node scripts/verify-apk.mjs <apk> [release-manifest.json]');
const manifest=JSON.parse(await readFile(process.argv[3]||'release-manifest.json','utf8'));
const digest=createHash('sha256').update(await readFile(apk)).digest('hex');
assert.equal(digest,manifest.apkSha256,`APK SHA-256 mismatch: ${digest}`);
console.log(`APK SHA-256 verified: ${digest}`);

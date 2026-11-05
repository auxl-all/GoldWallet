import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeConnectProofQr,encodeConnectProofQr} from '../.test-build/connect-proof.mjs';

const proof={origin:'https://bc2market.com',network:'bip122:0000000028f062b221c1a8a5cf0244b1',address:'bc1qr376r573797suy4un8qt2ee0xsjr580g4msjf2',message:`BC2 Market mobile connection - ${new Date().toISOString()} - 123e4567-e89b-12d3-a456-426614174000`,signature:'H0Q3Y0CHSIt/YcZAoysJrbURA1aUm+4Uj6OzsO9923HrUSWK+2q3TdAyYxZISwlzL15pk9jtFIJEbWDtHLJ5sWE='};

test('BC2 Connect QR payload round-trips without losing signed fields',()=>assert.deepEqual(decodeConnectProofQr(encodeConnectProofQr(proof)),proof));
test('BC2 Connect QR payload fits the QR capacity that previously overflowed',()=>assert.ok(encodeConnectProofQr(proof).length<425));

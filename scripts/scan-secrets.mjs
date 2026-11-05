import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {extname,resolve,relative} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const ignored=new Set(['.git','.gradle','build','node_modules','releases','dist','.test-build']);
const binary=new Set(['.png','.jpg','.jpeg','.gif','.jar','.apk','.keystore','.jks']);
const rules=[
  ['private key block',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token',/\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
  ['Google API key',/\bAIza[0-9A-Za-z_-]{35}\b/],
  ['AWS access key',/\bAKIA[0-9A-Z]{16}\b/],
  ['wallet mnemonic assignment',/(?:mnemonic|seedPhrase|recoveryPhrase)\s*[:=]\s*['"][a-z]+(?:\s+[a-z]+){11,23}['"]/i]
];
async function files(dir){const result=[];for(const item of await readdir(dir,{withFileTypes:true})){if(ignored.has(item.name))continue;const path=resolve(dir,item.name);if(item.isDirectory())result.push(...await files(path));else if(!binary.has(extname(item.name).toLowerCase()))result.push(path)}return result}
if(process.argv.includes('--self-test')){assert.ok(rules.some(([,rule])=>rule.test('-----BEGIN PRIVATE'+' KEY-----')));console.log('Secret scanner self-test passed');process.exit(0)}
const findings=[];for(const file of await files(root)){let text;try{text=await readFile(file,'utf8')}catch{continue}for(const [name,rule] of rules)if(rule.test(text))findings.push(`${relative(root,file)}: ${name}`)}
assert.equal(findings.length,0,`Potential secrets found:\n${findings.join('\n')}`);
console.log('No high-confidence secrets found in the working tree');

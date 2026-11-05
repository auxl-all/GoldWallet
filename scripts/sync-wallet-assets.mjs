import {cp, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const dist=resolve(root,'wallet-web/dist');
const assets=resolve(root,'app/src/main/assets/wallet');
const files=await readdir(dist);
for(const file of files)await cp(resolve(dist,file),resolve(assets,file),{recursive:true});
console.log(`Synchronized ${files.length} generated wallet assets`);

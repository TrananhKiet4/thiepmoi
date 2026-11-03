import {copyFileSync,mkdirSync} from 'node:fs';
const target=new URL('../apps/api/dist/apps/api/src/',import.meta.url);
mkdirSync(target,{recursive:true});copyFileSync(new URL('../apps/api/src/excel-worker.mjs',import.meta.url),new URL('excel-worker.mjs',target));

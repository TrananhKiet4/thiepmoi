import {copyFileSync,mkdirSync} from 'node:fs';
const target=new URL('../backend/dist/backend/src/utils/',import.meta.url);
mkdirSync(target,{recursive:true});copyFileSync(new URL("../backend/src/utils/excel-worker.mjs",import.meta.url),new URL('excel-worker.mjs',target));

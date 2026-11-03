import {config} from 'dotenv';
import {spawnSync} from 'node:child_process';
import {mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
config({quiet:true});
const action=process.argv[2],url=new URL(process.env.DATABASE_URL??'');
const bin=process.env.PGBIN??(process.platform==='win32'&&existsSync('C:/Program Files/PostgreSQL/18/bin')?'C:/Program Files/PostgreSQL/18/bin':'');
const exe=n=>bin?join(bin,n+(process.platform==='win32'?'.exe':'')):n;
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:url.pathname.slice(1)};
function run(command,args,extra={}){const r=spawnSync(exe(command),args,{env:{...env,...extra},stdio:'inherit',windowsHide:true});if(r.error||r.status!==0)throw new Error(`${command} failed; no database credentials printed`);}
if(action==='backup'){
 mkdirSync('.data/backups',{recursive:true});const output=resolve(process.argv[3]??`.data/backups/invitations-${new Date().toISOString().replace(/[:.]/g,'-')}.dump`);
 run('pg_dump',['--format=custom','--no-owner','--no-acl','--file',output]);console.log(`Backup: ${output}`);
}else if(action==='restore'){
 const file=process.argv[3],target=process.argv[4];
 if(!file||!target||!/^[a-z][a-z0-9_]{0,62}$/.test(target)||target===env.PGDATABASE)throw new Error('Usage: npm run restore -- /absolute/file.dump NEW_DATABASE; target must differ from source. Existing databases are never overwritten.');
 if(!existsSync(resolve(file)))throw new Error('Backup file not found');
 run('createdb',[target],{PGDATABASE:'postgres'});run('pg_restore',['--no-owner','--no-acl','--exit-on-error','--dbname',target,resolve(file)],{PGDATABASE:target});
 console.log(`Restored to new database: ${target}. Source database unchanged.`);
}else throw new Error('Use backup or restore');

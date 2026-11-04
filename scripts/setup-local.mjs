import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
process.chdir(root);
const rootData=resolve(root,'.data');mkdirSync(rootData,{recursive:true});
const bin=process.env.PGBIN??(process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin':'');
const exe=n=>bin?join(bin,n+(process.platform==='win32'?'.exe':'')):n;
function run(name,args,env={}){const r=spawnSync(exe(name),args,{encoding:'utf8',env:{...process.env,...env},windowsHide:true,stdio:name==='pg_ctl'?'ignore':'pipe',timeout:30000});if(r.error||r.status!==0)throw new Error(`${name}: ${r.error?.message??r.stderr??r.stdout}`);return r.stdout??'';}
if(!existsSync('.env')){
 const pass=randomBytes(24).toString('hex');
 const env=readFileSync('.env.example','utf8').replaceAll('local_dev_only',pass).replace('REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS',randomBytes(48).toString('hex')).replace('REPLACE_WITH_BASE64_32_BYTE_KEY',randomBytes(32).toString('base64'));
 writeFileSync('.env',env,{mode:0o600});
}
const {parse}=await import('dotenv');const env=parse(readFileSync('.env'));
const db=new URL(env.DATABASE_URL);assert.equal(db.hostname,'localhost','This helper is local-only');assert.equal(db.port,'54329','Use an isolated development port');
if(!env.DIRECT_URL)writeFileSync('.env',readFileSync('.env','utf8')+'\nDIRECT_URL='+JSON.stringify(env.DATABASE_URL)+'\n',{mode:0o600});
const pgdata=resolve(rootData,'postgres');
if(!existsSync(join(pgdata,'PG_VERSION'))){
 const passfile=join(rootData,'.init-password');writeFileSync(passfile,db.password,{mode:0o600});
 try{run('initdb',['-D',pgdata,'-U',db.username,'--auth=scram-sha-256','--pwfile',passfile,'--encoding=UTF8','--locale=C']);}finally{unlinkSync(passfile);}
}
const status=spawnSync(exe('pg_ctl'),['-D',pgdata,'status'],{windowsHide:true,stdio:'ignore'});
if(status.status!==0){
 if(process.platform==='win32'){
  const launched=spawnSync('powershell.exe',['-NoProfile','-File',join(root,'scripts/start-local-postgres.ps1'),'-PgBin',bin],{windowsHide:true,stdio:'inherit',timeout:15000});
  if(launched.status!==0)throw new Error('Could not start local PostgreSQL');
 }else run('pg_ctl',['-D',pgdata,'-l',join(rootData,'postgres.log'),'-o','-p 54329 -h 127.0.0.1','-w','start']);
 for(let i=0;i<60;i++){
  if(spawnSync(exe('pg_isready'),['-h','127.0.0.1','-p','54329'],{stdio:'ignore',windowsHide:true}).status===0)break;
  if(i===59)throw new Error('PostgreSQL startup timed out; see .data/postgres.log');
  await new Promise(resolve=>setTimeout(resolve,500));
 }
}
for(const name of ['invitations','invitations_test']){
 const present=run('psql',['-h','127.0.0.1','-p','54329','-U',db.username,'-d','postgres','-tAc',`SELECT 1 FROM pg_database WHERE datname='${name}'`],{PGPASSWORD:db.password});
 if(!present.trim())run('createdb',['-h','127.0.0.1','-p','54329','-U',db.username,name],{PGPASSWORD:db.password});
}
const testDb=new URL(env.DATABASE_URL);testDb.pathname='/invitations_test';
const testEnv=readFileSync('.env','utf8').replaceAll(env.DATABASE_URL,testDb.toString()).replace(/^DIRECT_URL=.*$/m,'DIRECT_URL='+JSON.stringify(testDb.toString()));
writeFileSync('.env.test',testEnv+'\nNODE_ENV=test\n',{mode:0o600});
console.log('Local PostgreSQL ready at localhost:54329; isolated dev/test databases and ignored environment files ready.');

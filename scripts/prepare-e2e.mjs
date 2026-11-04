import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {parse} from 'dotenv';
import {join} from 'node:path';
const current=readFileSync('.env','utf8');let env=parse(current);
const email=env.ADMIN_BOOTSTRAP_EMAIL||'admin@example.test';const password=env.ADMIN_BOOTSTRAP_PASSWORD||randomBytes(20).toString('base64url');
const local=current.replace(/^ADMIN_BOOTSTRAP_EMAIL=.*$/m,`ADMIN_BOOTSTRAP_EMAIL=${email}`).replace(/^ADMIN_BOOTSTRAP_PASSWORD=.*$/m,`ADMIN_BOOTSTRAP_PASSWORD=${password}`);
writeFileSync('.env',local,{mode:0o600});env=parse(local);
const url=new URL(env.DATABASE_URL);if(url.hostname!=='localhost'||url.pathname!=='/invitations')throw new Error('E2E preparation only supports the isolated local development cluster');
const bin=process.env.PGBIN??(process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin':'');
const exe=n=>bin?join(bin,n+(process.platform==='win32'?'.exe':'')):n;
const pgEnv={...process.env,PGPASSWORD:decodeURIComponent(url.password)};
const args=['-h','127.0.0.1','-p',url.port,'-U',url.username];
const exists=spawnSync(exe('psql'),[...args,'-d','postgres','-tAc',"SELECT 1 FROM pg_database WHERE datname='invitations_e2e'"],{encoding:'utf8',env:pgEnv,windowsHide:true});
if(exists.status!==0)throw new Error('Local PostgreSQL not ready');
if(!exists.stdout.trim()){const created=spawnSync(exe('createdb'),[...args,'invitations_e2e'],{env:pgEnv,windowsHide:true});if(created.status!==0)throw new Error('Could not create E2E database');}
url.pathname='/invitations_e2e';let e2e=local.replaceAll(env.DATABASE_URL,url.toString());
e2e=/^DIRECT_URL=/m.test(e2e)?e2e.replace(/^DIRECT_URL=.*$/m,'DIRECT_URL='+JSON.stringify(url.toString())):e2e+'\nDIRECT_URL='+JSON.stringify(url.toString())+'\n';
for(const [key,value] of Object.entries({PORT:'4401',APP_ORIGIN:'http://localhost:4174',CORS_ORIGINS:'http://localhost:4174',WEB_PORT:'4174',API_PROXY_TARGET:'http://localhost:4401'})){
 const line=new RegExp('^'+key+'=.*$','m');e2e=line.test(e2e)?e2e.replace(line,()=>key+'='+value):e2e+'\n'+key+'='+value;
}
writeFileSync('.env.e2e',e2e,{mode:0o600});
function run(args,vars){const r=spawnSync(process.execPath,args,{env:{...process.env,...vars},stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status??1);}
for(const vars of [env,parse(e2e)]){
 run(['node_modules/prisma/build/index.js','migrate','deploy','--schema','backend/prisma/schema.prisma'],{...vars,DIRECT_URL:vars.DATABASE_URL});
 run(['--import','tsx','backend/scripts/cli.ts','admin'],vars);
 run(['--import','tsx','backend/scripts/cli.ts','seed'],vars);
}
console.log('Demo and separate E2E environment ready. Login credentials stored only in ignored .env files.');

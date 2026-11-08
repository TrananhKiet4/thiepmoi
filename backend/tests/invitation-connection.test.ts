import {expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';

it('serves admin preview and guest invitation with media using one database connection',()=>{
 const url=new URL(process.env.DATABASE_URL!);
 if(process.env.NODE_ENV!=='test'||!url.pathname.endsWith('_test'))throw new Error('Requires the isolated test database');
 url.searchParams.set('connection_limit','1');url.searchParams.set('pool_timeout','5');
 const code=`import assert from 'node:assert/strict';
 import request from 'supertest';import {createApp} from './backend/src/app.ts';
 import {resetTestDatabase,setupTestData,credentialFromLink} from './backend/tests/helpers.ts';
 import {prisma} from './backend/src/config/database.ts';
 const app=createApp();let stage='fixture';
 try{await resetTestDatabase();const f=await setupTestData();
  const issued=await request(app).get('/api/v1/admin/invitations/'+f.invitation.id+'/link').set('Cookie',f.cookie);assert.equal(issued.status,200);const short=credentialFromLink(issued.body.data.url);
  for(const kind of ['preview','guest','short']){stage=kind;if(kind==='short')process.env.NODE_ENV='development';
   const call=kind==='preview'?request(app).get('/api/v1/admin/events/'+f.event.id+'/preview').set('Cookie',f.cookie):request(app).get('/api/v1/guest/invitation').set('Authorization','Bearer '+(kind==='short'?short:f.token));
   const response=await call.timeout({deadline:10000});assert.equal(response.status,200);assert.equal(response.body.data.eventId,f.event.id);assert(Object.keys(response.body.data.media).length>0);
  }
 }catch(error){console.error(JSON.stringify({stage,errorType:error.name,code:error.code??error.errorCode}));process.exitCode=1;}finally{await prisma.$disconnect();}`;
 const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{env:{...process.env,DATABASE_URL:url.toString()},encoding:'utf8',windowsHide:true,timeout:25000});
 expect(result.status,result.stderr).toBe(0);
});

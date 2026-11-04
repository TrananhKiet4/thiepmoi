import {expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';

const unreachable='postgresql://invalid:invalid@127.0.0.1:1/unused';
it('uses DIRECT_URL for Prisma migration status even when runtime URL is unavailable',()=>{
 const target=process.env.DATABASE_URL;
 if(!target||!new URL(target).pathname.endsWith('_test'))throw new Error('Connection test requires the isolated test database');
 const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','status','--schema','backend/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:unreachable,DIRECT_URL:target},encoding:'utf8',windowsHide:true,timeout:25000});
 expect(result.status).toBe(0);
 expect(result.stdout).toContain('Database schema is up to date');
});
it('keeps application queries on DATABASE_URL when the direct endpoint is unavailable',()=>{
 const target=process.env.DATABASE_URL;
 if(!target||!new URL(target).pathname.endsWith('_test'))throw new Error('Connection test requires the isolated test database');
 const code='import {PrismaClient} from "@prisma/client";const p=new PrismaClient();try{const rows=await p.$queryRaw`SELECT 1 AS value`;if(rows[0].value!==1)process.exitCode=1;}finally{await p.$disconnect();}';
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,DATABASE_URL:target,DIRECT_URL:unreachable},encoding:'utf8',windowsHide:true,timeout:15000});
 expect(result.status).toBe(0);
});

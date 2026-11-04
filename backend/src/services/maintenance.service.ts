import {prisma} from '../config/database.js';
import {cleanupTemporaryObjects} from './temporary-object.service.js';
import {Prisma} from '@prisma/client';

export async function runMaintenance(){
 const now=new Date(),oldImports=new Date(Date.now()-7*86400000),temporaryObjects=await cleanupTemporaryObjects();
 const counts={sessions:0,idempotency:0,imports:0,rateLimits:0},failedTasks:string[]=[];
 const jobs=[
  ['sessions',Prisma.sql`WITH candidates AS MATERIALIZED (SELECT "id" FROM "AdminSession" WHERE "expiresAt"<${now} OR "revokedAt" IS NOT NULL LIMIT 1000 FOR UPDATE SKIP LOCKED) DELETE FROM "AdminSession" WHERE "id" IN (SELECT "id" FROM candidates)`],
  ['idempotency',Prisma.sql`WITH candidates AS MATERIALIZED (SELECT "id" FROM "IdempotencyRecord" WHERE "expiresAt"<${now} LIMIT 1000 FOR UPDATE SKIP LOCKED) DELETE FROM "IdempotencyRecord" WHERE "id" IN (SELECT "id" FROM candidates)`],
  ['imports',Prisma.sql`WITH candidates AS MATERIALIZED (SELECT "id" FROM "ImportBatch" WHERE "createdAt"<${oldImports} LIMIT 1000 FOR UPDATE SKIP LOCKED) DELETE FROM "ImportBatch" WHERE "id" IN (SELECT "id" FROM candidates)`],
  ['rateLimits',Prisma.sql`WITH candidates AS MATERIALIZED (SELECT "key" FROM "RateLimitBucket" WHERE "expiresAt"<${now} LIMIT 1000 FOR UPDATE SKIP LOCKED) DELETE FROM "RateLimitBucket" WHERE "expiresAt"<${now} AND "key" IN (SELECT "key" FROM candidates)`]
 ] as const;
 for(const [name,query]of jobs){
  try{counts[name]=await prisma.$transaction(async tx=>{
   await tx.$executeRawUnsafe("SET LOCAL lock_timeout='250ms'");await tx.$executeRawUnsafe("SET LOCAL statement_timeout='2s'");return tx.$executeRaw(query);
  },{maxWait:2000,timeout:3000});}catch{failedTasks.push(name);console.error(JSON.stringify({code:'MAINTENANCE_DB_FAILED',task:name}));}
 }
 return {...counts,temporaryObjects,failedTasks};
}

import {prisma} from '../config/database.js';
import {cleanupTemporaryObjects} from './temporary-object.service.js';

export async function runMaintenance(){
 const now=new Date();
 const [sessions,idempotency,imports,rateLimits]=await prisma.$transaction([
  prisma.adminSession.deleteMany({where:{OR:[{expiresAt:{lt:now}},{revokedAt:{not:null}}]}}),
  prisma.idempotencyRecord.deleteMany({where:{expiresAt:{lt:now}}}),
  prisma.importBatch.deleteMany({where:{createdAt:{lt:new Date(Date.now()-7*86400000)}}}),
  prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" IN (SELECT "key" FROM "RateLimitBucket" WHERE "expiresAt"<${now} LIMIT 1000)`
 ]);
 return {sessions:sessions.count,idempotency:idempotency.count,imports:imports.count,rateLimits,temporaryObjects:await cleanupTemporaryObjects()};
}

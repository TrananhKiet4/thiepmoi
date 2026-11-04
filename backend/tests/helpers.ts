import {randomUUID} from 'node:crypto';
import {hash} from '@node-rs/argon2';
import request from 'supertest';
import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {prisma} from '../src/config/database.js';
import {createInvitationToken} from '../src/utils/token.js';
import {config} from '../src/config/env.js';
import {createApp} from '../src/app.js';

export {demoContent} from '../prisma/data/demo.js';
import {demoContent} from '../prisma/data/demo.js';
export async function resetTestDatabase(){
 if(process.env.NODE_ENV!=='test'||!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))throw new Error('Refusing to reset a non-test database');
 await prisma.temporaryObject.deleteMany();await prisma.rateLimitBucket.deleteMany();
 await prisma.idempotencyRecord.deleteMany();await prisma.auditLog.deleteMany();await prisma.importBatch.deleteMany();await prisma.wish.deleteMany();await prisma.rSVP.deleteMany();await prisma.invitation.deleteMany();await prisma.guest.deleteMany();
 await prisma.event.updateMany({data:{draftRevisionId:null,publishedRevisionId:null}});await prisma.eventRevision.deleteMany();await prisma.mediaAsset.deleteMany();await prisma.event.deleteMany();await prisma.adminSession.deleteMany();await prisma.adminUser.deleteMany();
}
export async function setupTestData(){
 const admin=await prisma.adminUser.create({data:{email:'test-'+randomUUID()+'@example.test',passwordHash:await hash('TestOnly-Password-12345')}});
 let event=await prisma.event.create({data:{ownerId:admin.id,slug:'demo-'+randomUUID()}});
 const assetId=randomUUID(),storageKey=`${event.id}/${assetId}/800.webp`;
 const bytes=await sharp({create:{width:800,height:1000,channels:3,background:'#ede3cc'}}).webp().toBuffer();
 await mkdir(dirname(join(config.storageRoot,'private',storageKey)),{recursive:true});await mkdir(dirname(join(config.storageRoot,'public',storageKey)),{recursive:true});
 await writeFile(join(config.storageRoot,'private',storageKey),bytes);await writeFile(join(config.storageRoot,'public',storageKey),bytes);
 await prisma.mediaAsset.create({data:{id:assetId,eventId:event.id,storageKey,type:'IMAGE',mimeType:'image/webp',bytes:bytes.length,width:800,height:1000,alt:'Ảnh mẫu',status:'READY',publicReady:true,variants:{'0':{key:storageKey,width:800,height:1000,mimeType:'image/webp'}}}});
 const content=demoContent(assetId),revision=await prisma.eventRevision.create({data:{eventId:event.id,revisionNo:1,contentJson:content as any}});
 event=await prisma.event.update({where:{id:event.id},data:{draftRevisionId:revision.id,publishedRevisionId:revision.id,publishedAt:new Date()}});
 const guest=await prisma.guest.create({data:{eventId:event.id,guestCode:'DEMO001',fullName:'Khách mẫu',displayName:'Bạn An',salutation:'bạn'}});
 const invitationId=randomUUID(),tokenData=createInvitationToken(invitationId);const {token,...encrypted}=tokenData;
 const invitation=await prisma.invitation.create({data:{id:invitationId,eventId:event.id,guestId:guest.id,...encrypted}});
 const login=await request(createApp()).post('/api/v1/admin/auth/login').set('Origin',config.appOrigin).send({email:admin.email,password:'TestOnly-Password-12345'});
 if(login.status!==200)throw new Error(`Fixture login failed ${login.status}`);
 const cookie=(login.headers['set-cookie'] as unknown as string[])[0].split(';')[0],csrf=login.body.data.csrfToken;
 return {admin,event,content,guest,invitation,token,csrf,cookie};
}

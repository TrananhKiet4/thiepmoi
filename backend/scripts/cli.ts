import {hash} from '@node-rs/argon2';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {prisma,withTransaction} from '../src/config/database.js';
import {createInvitationToken} from '../src/utils/token.js';
import {demoContent} from '../prisma/data/demo.js';
import {runMaintenance} from '../src/services/maintenance.service.js';
import {demoMediaId,editableContent} from '../../packages/contracts/src/index.js';

const command=process.argv[2];
try{
 if(command==='admin'){
  const email=z.string().trim().email().transform(s=>s.toLowerCase()).parse(process.env.ADMIN_BOOTSTRAP_EMAIL);
  const existing=await prisma.adminUser.findUnique({where:{email}});
  const admin=existing??await prisma.adminUser.create({data:{email,passwordHash:await hash(z.string().min(12).max(200).parse(process.env.ADMIN_BOOTSTRAP_PASSWORD))}});
  if(existing)console.log('Admin already exists; password preserved.');
  else console.log('Admin created. Credentials are never printed.');
  if(!await prisma.event.findFirst({where:{ownerId:admin.id}}))await withTransaction(async tx=>{
   const content=editableContent(demoContent(null));content.host={fullName:'',university:'',major:'',cohort:''};content.ceremony.venueName='';content.ceremony.address='';
   const event=await tx.event.create({data:{ownerId:admin.id,slug:'graduation-'+admin.id}});
   const revision=await tx.eventRevision.create({data:{eventId:event.id,revisionNo:1,contentJson:content as any}});
   await tx.event.update({where:{id:event.id},data:{draftRevisionId:revision.id}});
  });
 }else if(command==='seed'){
  if(process.env.NODE_ENV==='production')throw new Error('Demo seed is disabled in production');
  const owner=await prisma.adminUser.findFirst({orderBy:{createdAt:'asc'}});if(!owner)throw new Error('Create an administrator first with npm run admin:create');
  if(await prisma.event.findUnique({where:{slug:'tot-nghiep-demo'}})){console.log('Demo already exists; existing content and guests preserved.');}
  else{
   const initial=await prisma.event.findFirst({where:{ownerId:owner.id,slug:'graduation-'+owner.id,publishedRevisionId:null,guests:{none:{}}}});
   const initialRevision=initial?.draftRevisionId?await prisma.eventRevision.findUnique({where:{id:initial.draftRevisionId}}):null;
   const reusable=initial&&initialRevision?.revisionNo===1&&!(initialRevision.contentJson as any).host.fullName?initial:null;
   const eventId=reusable?.id??randomUUID();
   await withTransaction(async tx=>{
    if(reusable)await tx.event.update({where:{id:eventId},data:{slug:'tot-nghiep-demo'}});
    else await tx.event.create({data:{id:eventId,ownerId:owner.id,slug:'tot-nghiep-demo'}});
    const content=demoContent(demoMediaId),revision=await tx.eventRevision.create({data:{eventId,revisionNo:reusable?2:1,contentJson:content as any}});
    await tx.event.update({where:{id:eventId},data:{draftRevisionId:revision.id,publishedRevisionId:revision.id,publishedAt:new Date()}});
    for(let i=1;i<=12;i++){
     const guest=await tx.guest.create({data:{eventId,guestCode:'DEMO'+String(i).padStart(3,'0'),fullName:'Khách minh họa '+i,displayName:i===1?'Bạn An':'Bạn mẫu '+i,groupKey:i<=8?'ban_be':'gia_dinh',salutation:'bạn'}});
     const invitationId=randomUUID(),{token:_token,...encrypted}=createInvitationToken(invitationId);
     await tx.invitation.create({data:{id:invitationId,eventId,guestId:guest.id,...encrypted}});
    }
   });
   console.log('Demo created: 12 guests, generated illustration, music off, dates in 2099 clearly marked for replacement. Get invitation links from admin; none printed in logs.');
  }
 }else if(command==='maintenance'){
  console.log(JSON.stringify(await runMaintenance()));
 }else throw new Error('Use admin, seed or maintenance');
}catch(error){console.error(error instanceof z.ZodError?'Invalid bootstrap email/password (minimum 12 characters).':(error as Error).message);process.exitCode=1;}
finally{await prisma.$disconnect();}

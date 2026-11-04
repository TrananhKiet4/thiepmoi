import {hash} from '@node-rs/argon2';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import sharp from 'sharp';
import {prisma,withTransaction} from '../src/config/database.js';
import {createInvitationToken} from '../src/utils/token.js';
import {demoContent} from '../prisma/data/demo.js';
import {putPrivate} from '../src/services/storage.service.js';
import {preparePublishedMedia} from '../src/services/media.service.js';
import {runMaintenance} from '../src/services/maintenance.service.js';
import {editableContent} from '../../packages/contracts/src/index.js';

const command=process.argv[2];
try{
 if(command==='admin'){
  const email=z.string().trim().email().transform(s=>s.toLowerCase()).parse(process.env.ADMIN_BOOTSTRAP_EMAIL);
  const password=z.string().min(12).max(200).parse(process.env.ADMIN_BOOTSTRAP_PASSWORD);
  const existing=await prisma.adminUser.findUnique({where:{email}});
  const admin=existing??await prisma.adminUser.create({data:{email,passwordHash:await hash(password)}});
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
   const eventId=reusable?.id??randomUUID(),assetId=randomUUID(),key=`${eventId}/${assetId}/1280.webp`;
   const art=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1600" viewBox="0 0 800 1000"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#c5cfc7"/><stop offset="1" stop-color="#f5e5c8"/></linearGradient><linearGradient id="stone"><stop stop-color="#b99c73"/><stop offset="1" stop-color="#e2cba5"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h800v1000H0z"/><circle fill="#f5e4b6" cx="610" cy="205" r="105"/><path fill="#8b9e89" d="M0 660q200-150 400-20t400-40v400H0z"/><path fill="#526e5d" d="M0 715q250-60 450 10t350-10v285H0z"/><path fill="url(#stone)" d="M110 470h580v330H110z"/><path fill="#9d805e" d="m85 470 315-180 315 180z"/><path fill="#e9d4ae" d="m135 450 265-145 265 145z"/><path fill="#b59a74" d="M165 490h470v280H165z"/><g fill="#edddbe"><path d="M165 490h44v280h-44zM272 490h44v280h-44zM380 490h44v280h-44zM488 490h44v280h-44zM595 490h40v280h-40z"/><path d="M140 480h520v23H140zM140 754h520v24H140zM120 780h560v22H120zM100 806h600v20H100z"/></g><path fill="#dcc6a0" d="M280 826h240l150 174H130z"/><g fill="#355346"><circle cx="78" cy="605" r="70"/><circle cx="70" cy="690" r="85"/><circle cx="735" cy="610" r="90"/><circle cx="740" cy="715" r="80"/></g><path fill="#1e3930" d="M63 650h18v210H63zM725 650h17v210h-17z"/><path fill="#283c32" d="m322 192 78-32 78 32-78 32zM350 210v35q50 28 100 0v-35l-50 20z"/><path fill="none" stroke="#ac8a42" stroke-width="5" d="M475 194v59"/><path fill="#ac8a42" d="m475 249-8 23h16z"/><text x="400" y="920" text-anchor="middle" fill="#3d4939" font-family="Georgia,serif" font-size="20" letter-spacing="5">A NEW CHAPTER</text></svg>`;
   const image=await sharp(Buffer.from(art)).webp({quality:85}).toBuffer();await putPrivate(key,image,'image/webp');
   await withTransaction(async tx=>{
    if(reusable)await tx.event.update({where:{id:eventId},data:{slug:'tot-nghiep-demo'}});
    else await tx.event.create({data:{id:eventId,ownerId:owner.id,slug:'tot-nghiep-demo'}});
    await tx.mediaAsset.create({data:{id:assetId,eventId,storageKey:key,originalName:'campus-demo-generated.webp',type:'IMAGE',mimeType:'image/webp',bytes:image.length,width:1280,height:1600,alt:'Minh họa khuôn viên trường được tạo cho dữ liệu demo',variants:{'1280':{key,width:1280,height:1600,mimeType:'image/webp'}}}});
    const content=demoContent(assetId),revision=await tx.eventRevision.create({data:{eventId,revisionNo:reusable?2:1,contentJson:content as any}});
    await tx.event.update({where:{id:eventId},data:{draftRevisionId:revision.id}});
    for(let i=1;i<=12;i++){
     const guest=await tx.guest.create({data:{eventId,guestCode:'DEMO'+String(i).padStart(3,'0'),fullName:'Khách minh họa '+i,displayName:i===1?'Bạn An':'Bạn mẫu '+i,groupKey:i<=8?'ban_be':'gia_dinh',salutation:'bạn'}});
     const invitationId=randomUUID(),{token:_token,...encrypted}=createInvitationToken(invitationId);
     await tx.invitation.create({data:{id:invitationId,eventId,guestId:guest.id,...encrypted}});
    }
   });
   const content=demoContent(assetId);await preparePublishedMedia(eventId,content);
   const event=await prisma.event.findUniqueOrThrow({where:{id:eventId}});await prisma.event.update({where:{id:eventId},data:{publishedRevisionId:event.draftRevisionId,publishedAt:new Date()}});
   console.log('Demo created: 12 guests, generated illustration, music off, dates in 2099 clearly marked for replacement. Get invitation links from admin; none printed in logs.');
  }
 }else if(command==='maintenance'){
  console.log(JSON.stringify(await runMaintenance()));
 }else throw new Error('Use admin, seed or maintenance');
}catch(error){console.error(error instanceof z.ZodError?'Invalid bootstrap email/password (minimum 12 characters).':(error as Error).message);process.exitCode=1;}
finally{await prisma.$disconnect();}

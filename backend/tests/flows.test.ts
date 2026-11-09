import {beforeEach,describe,expect,it} from 'vitest';
import request from 'supertest';
import {randomBytes,randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import {prisma} from '../src/config/database.js';
import {config} from '../src/config/env.js';
import {resetTestDatabase,setupTestData,credentialFromLink} from './helpers.js';
import {vi} from 'vitest';
import * as tokens from '../src/utils/token.js';

const app=createApp();
let f:Awaited<ReturnType<typeof setupTestData>>;
const guest=(method:'get'|'post'|'put'|'patch'|'delete',path:string,token?:string)=>request(app)[method](`/api/v1/guest/${path}`).set('Authorization',`Bearer ${token??f.token}`);
const admin=(method:'get'|'post'|'put'|'patch'|'delete',path:string)=>request(app)[method](`/api/v1/admin/${path}`).set('Cookie',f.cookie).set('Origin','http://localhost:5173').set('X-CSRF-Token',f.csrf);
beforeEach(async()=>{await resetTestDatabase();f=await setupTestData();});

describe('published invitation and immutable content',()=>{
 it('edits and previews one invitation on its existing guest link',async()=>{
  const link=(await admin('get',`invitations/${f.invitation.id}/link`)).body.data.url;
  const credential=credentialFromLink(link);
  const original=(await guest('get','invitation',credential)).body.data;
  const letter=(view:any)=>view.content.sections.find((section:{type:string})=>section.type==='invitation').data;
  const other=await setupTestData();
  const path=`invitations/${f.invitation.id}/content`;
  const data={expectedVersion:f.invitation.version,personalMessage:'Lời mở riêng',letterTitle:'Tiêu đề riêng',letterMessage:'Trân trọng mời {{guestName}} đến dự lễ.'};
  expect((await admin('patch',`invitations/${other.invitation.id}/content`).send(data)).status).toBe(404);
  const invalid=await admin('patch',path).send({...data,letterTitle:'x'.repeat(201)});
  expect(invalid.status).toBe(400);
  expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  expect((await admin('patch',path).send(data)).status).toBe(200);
  expect((await admin('patch',path).send(data)).status).toBe(409);
  const current=(await guest('get','invitation',credential)).body.data;
  expect(current.personalMessage).toBe(data.personalMessage);
  expect(letter(current)).toEqual({title:data.letterTitle,message:`Trân trọng mời ${current.guest.recipientName} đến dự lễ.`});
  const draft=await prisma.eventRevision.create({data:{eventId:f.event.id,revisionNo:2,contentJson:{...f.content,host:{...f.content.host,fullName:'Chỉ có ở bản nháp'}}}});
  await prisma.event.update({where:{id:f.event.id},data:{draftRevisionId:draft.id}});
  const preview=(await admin('get',`events/${f.event.id}/preview?guestId=${f.guest.id}&source=published`)).body.data;
  expect(preview.preview).toBe(true);
  expect(preview.content.host.fullName).toBe(current.content.host.fullName);
  expect(letter(preview)).toEqual(letter(current));
  expect(preview.canRsvp).toBe(false);
  expect((await admin('get',`invitations/${f.invitation.id}/link`)).body.data.url).toBe(link);
  expect((await prisma.invitation.findUniqueOrThrow({where:{id:f.invitation.id}})).openedAt).toBeNull();
  expect((await admin('patch',path).send({expectedVersion:f.invitation.version+1,personalMessage:'',letterTitle:'',letterMessage:''})).status).toBe(200);
  const reset=(await guest('get','invitation',credential)).body.data;
  expect(letter(reset)).toEqual(letter(original));
  expect(reset.personalMessage).toBe(original.personalMessage);
 });
 it('uses the recipient’s greeting and honorific in the published invitation',async()=>{
  const message='Mình trân trọng mời bạn đến dự lễ tốt nghiệp. Sau buổi lễ, nếu bạn có thời gian, mình rất muốn gặp bạn để chụp ảnh cùng bạn bè.';
  const openingTemplate='Thân mời {{guestName}} đến chung vui trong lễ tốt nghiệp của mình. Mình rất mong được gặp bạn và chụp cùng nhau một tấm ảnh để nhớ ngày này.';
  const content={...f.content,sections:f.content.sections.map(section=>{
   if(section.type==='opening')return {...section,data:{...section.data,messageTemplate:openingTemplate}};
   if(section.type==='invitation')return {...section,data:{...section.data,message}};
   if(section.type==='response')return {...section,data:{...section.data,wishIntro:'Nếu bạn muốn, hãy viết vài dòng. Mình mong được đọc lời chúc của bạn.'}};
   if(section.type==='closing')return {...section,data:{...section.data,message:'Cảm ơn bạn đã mở thiệp. Mình rất trân trọng.'}};
   return section;
  })};
  const revision=await prisma.eventRevision.create({data:{eventId:f.event.id,revisionNo:2,contentJson:content}});
  await prisma.event.update({where:{id:f.event.id},data:{publishedRevisionId:revision.id}});
  for(const [groupKey,salutation,displayName,recipientName,greeting,address,headingAddress,inviting,speaker,sentenceSpeaker] of [
   ['club','Anh','Anh Khách','Khách','Kính gửi','anh','anh','Kính mời','em','Em'],
   ['club','Anh hai','Anh hai Khách','Khách','Kính gửi','anh hai','anh','Kính mời','em','Em'],
   ['club','Chị hai','Chị hai Khách','Khách','Kính gửi','chị hai','chị','Kính mời','em','Em'],
   ['club','Bạn','Khách','Khách','Thân gửi','bạn','bạn','Thân mời','mình','Mình'],
   ['club','Em','Em Khách','Khách','Thân gửi','em','em','Thân mời','anh','Anh'],
   ['club','','Thím iu','Thím iu','Kính gửi','Thím iu','Thím iu','Kính mời','con','Con'],
   ['gia_dinh','','Đại gia đình thương yêu','Đại gia đình thương yêu','Thương gửi','đại gia đình','cả nhà','Thương mời','con','Con'],
   ['gia_dinh','Em yêu','Em yêu Khách','Khách','Thương gửi','em yêu','em yêu','Thương mời','anh','Anh'],
  ]){
   await prisma.guest.update({where:{id:f.guest.id},data:{groupKey,salutation,displayName}});
   const response=await guest('get','invitation');
   expect(response.status).toBe(200);
   expect(response.body.data.guest.displayName).toBe(displayName);
   expect(response.body.data.guest.recipientName).toBe(recipientName);
   expect(response.body.data.guest.recipientGreeting).toBe(greeting);
   expect(response.body.data.content.sections.find((section:{type:string})=>section.type==='opening').data.title).toBe('MỘT LỜI MỜI DÀNH RIÊNG CHO');
   expect(response.body.data.personalMessage).toBe(`${inviting} ${recipientName} đến chung vui trong lễ tốt nghiệp của ${speaker}. ${sentenceSpeaker} rất mong được gặp ${address} và chụp cùng nhau một tấm ảnh để nhớ ngày này.`);
   const letter=response.body.data.content.sections.find((section:{type:string})=>section.type==='invitation').data;
   expect(letter.title).toBe(`Hẹn ${headingAddress} trong ngày đặc biệt`);
   expect(letter.message)
    .toBe(`Trân trọng mời ${address} đến chụp hình và lưu giữ những kỷ niệm trong ngày tốt nghiệp của ${speaker}.`);
   const responseSection=response.body.data.content.sections.find((section:{type:string})=>section.type==='response').data;
   const responseAddress=address==='đại gia đình'?'cả nhà':address;
   expect(responseSection.title).toBe(`${responseAddress.charAt(0).toUpperCase()+responseAddress.slice(1)} sẽ đến chứ?`);
   expect(responseSection.wishIntro).toBe(`Nếu ${address} muốn, hãy viết vài dòng. ${sentenceSpeaker} mong được đọc lời chúc của ${address}.`);
   expect(response.body.data.content.sections.find((section:{type:string})=>section.type==='closing').data.message)
    .toBe(`Cảm ơn ${address} đã mở thiệp. ${sentenceSpeaker} rất trân trọng.`);
  }
  await prisma.invitation.update({where:{id:f.invitation.id},data:{personalMessage:'Lời mở riêng dành cho {{guestName}}.'}});
  expect((await guest('get','invitation')).body.data.personalMessage).toBe('Lời mở riêng dành cho Khách.');
 });
 it('issues a stable five-character named link while keeping the original capability valid',async()=>{
  await prisma.guest.update({where:{id:f.guest.id},data:{fullName:'Đặng Thị Ánh',displayName:'Bạn Ánh'}});
  const first=await admin('get',`invitations/${f.invitation.id}/link`);expect(first.status).toBe(200);
  const url=new URL(first.body.data.url),parts=url.pathname.split('/');expect(parts).toHaveLength(4);expect(parts[2]).toMatch(/^[A-Za-z0-9]{5}$/);expect(parts[3]).toBe('dang-thi-anh');
  expect((await admin('get',`invitations/${f.invitation.id}/link`)).body.data.url).toBe(first.body.data.url);
  expect(first.body.data.message).toContain(first.body.data.url);
  const credential=parts[2]+'.'+parts[3];expect((await guest('get','invitation',credential)).body.data.guest.fullName).toBe('Đặng Thị Ánh');
  expect((await guest('get','invitation',parts[2]+'.nguoi-khac')).status).toBe(401);
  expect((await guest('get','invitation')).status).toBe(200);
  expect((await prisma.invitation.findUniqueOrThrow({where:{id:f.invitation.id}})).tokenHash).toBe(f.invitation.tokenHash);
 });
 it('previews draft personalization without creating opens or responses and validates publication',async()=>{
  const changed={...f.content,host:{...f.content.host,fullName:'Preview host'},groupMessages:{friends:'Hi {{guestName}} from {{hostName}}'}};
  await prisma.guest.update({where:{id:f.guest.id},data:{groupKey:'friends',displayName:'Friend'}});
  const save=await admin('patch',`events/${f.event.id}/draft`).set('If-Match',String(f.event.version)).send({content:changed});
  expect(save.status).toBe(200);
  const preview=await admin('get',`events/${f.event.id}/preview?guestId=${f.guest.id}`);
  expect(preview.status).toBe(200);
  expect(preview.body.data.preview).toBe(true);
  expect(preview.body.data.personalMessage).toBe('Hi Friend from Preview host');
  expect((await prisma.invitation.findUniqueOrThrow({where:{id:f.invitation.id}})).openedAt).toBeNull();
  expect(await prisma.rSVP.count()).toBe(0);
  const missing={...changed,host:{...changed.host,fullName:''}};
  const invalid=await admin('patch',`events/${f.event.id}/draft`).set('If-Match',String(save.body.data.version)).send({content:missing});
  expect(invalid.status).toBe(200);
  expect((await admin('post',`events/${f.event.id}/publish`).send({expectedVersion:invalid.body.data.version})).status).toBe(422);
  expect((await guest('get','invitation')).body.data.content.host.fullName).toBe(f.content.host.fullName);
 });
 it('serves published content while draft changes remain private and rejects stale draft saves',async()=>{
  const changed={...f.content,host:{...f.content.host,fullName:'Draft only'}};
  const saved=await admin('patch',`events/${f.event.id}/draft`).set('If-Match',String(f.event.version)).send({content:changed});
  expect(saved.status).toBe(200);
  expect(saved.body.data.version).toBe(f.event.version+1);
  expect((await guest('get','invitation')).body.data.content.host.fullName).toBe(f.content.host.fullName);
  expect((await admin('patch',`events/${f.event.id}/draft`).set('If-Match',String(f.event.version)).send({content:changed})).status).toBe(409);
  expect(await prisma.eventRevision.count({where:{eventId:f.event.id}})).toBe(2);
 });
 it('unpublishes immediately without exposing a draft or accepting writes',async()=>{
  expect((await admin('post',`events/${f.event.id}/unpublish`).send({expectedVersion:f.event.version})).status).toBe(200);
  expect((await guest('get','invitation')).status).toBe(404);
  expect((await guest('put','rsvp').set('Idempotency-Key',randomUUID()).send({status:'ATTENDING',expectedVersion:0})).status).toBe(404);
 });
});
describe('versioned guest responses',()=>{
 it('keeps named replies on a shared family invitation independent',async()=>{
  const register=(name:string,key=randomUUID(),token?:string)=>guest('post','family-responders',token).set('Idempotency-Key',key).send({name});
  expect((await register('Khách A')).status).toBe(404);
  await prisma.rSVP.create({data:{invitationId:f.invitation.id,status:'ATTENDING',note:'Phản hồi gia đình trước đây'}});
  await prisma.invitation.update({where:{id:f.invitation.id},data:{allowMultipleResponses:true}});
  const shared=(await guest('get','invitation')).body.data;
  expect(shared.familyReply).toEqual({canRegister:true});
  expect(shared.rsvp).toBeNull();
  expect(shared.canRsvp).toBe(false);
  expect((await guest('put','rsvp').set('Idempotency-Key',randomUUID()).send({status:'DECLINED',expectedVersion:1})).body.error.code).toBe('RESPONDER_REQUIRED');
  expect((await guest('put','wish').set('Idempotency-Key',randomUUID()).send({body:'Lời chúc không có tên',consentPublic:false,expectedVersion:0})).body.error.code).toBe('RESPONDER_REQUIRED');
  const key=randomUUID();
  const first=await register('Khách A',key),replay=await register('Khách A',key),second=await register('Khách B');
  expect([first.status,replay.status,second.status]).toEqual([201,201,201]);
  const a=first.body.data.token,b=second.body.data.token;
  expect(replay.body.data.token).toBe(a);
  expect(b).not.toBe(a);
  expect((await register('Khách C',randomUUID(),a)).status).toBe(404);
  expect(await prisma.invitation.count({where:{familyParentId:f.invitation.id}})).toBe(2);
  const reply=await guest('put','rsvp',a).set('Idempotency-Key',randomUUID()).send({status:'ATTENDING',expectedVersion:0});
  expect(reply.status).toBe(200);
  expect((await guest('put','rsvp',b).set('Idempotency-Key',randomUUID()).send({status:'DECLINED',expectedVersion:0})).status).toBe(200);
  for(const [token,body] of [[a,'Lời chúc A'],[b,'Lời chúc B']]){
   expect((await guest('put','wish',token).set('Idempotency-Key',randomUUID()).send({body,consentPublic:true,expectedVersion:0})).status).toBe(200);
  }
  const privateA=(await guest('get','invitation',a)).body.data,privateB=(await guest('get','invitation',b)).body.data;
  expect(privateA).toMatchObject({responderName:'Khách A',guest:{displayName:shared.guest.displayName},rsvp:{status:'ATTENDING'},wish:{body:'Lời chúc A'}});
  expect(privateB).toMatchObject({responderName:'Khách B',rsvp:{status:'DECLINED'},wish:{body:'Lời chúc B'}});
  expect((await guest('get','invitation')).body.data.wish).toBeNull();
  expect((await guest('get','wishes')).body.data.items.map((item:{displayName:string})=>item.displayName).sort()).toEqual(['Khách A','Khách B']);
  const adminRows=(await admin('get',`events/${f.event.id}/guests`)).body.data.items;
  expect(adminRows.filter((row:any)=>row.invitation.familyResponder).map((row:any)=>row.fullName).sort()).toEqual(['Khách A','Khách B']);
  expect((await admin('post',`invitations/${f.invitation.id}/revoke`).send({expectedVersion:f.invitation.version})).status).toBe(200);
  expect((await guest('get','invitation',a)).status).toBe(404);
  expect((await guest('get','invitation',b)).status).toBe(404);
  expect((await admin('get',`events/${f.event.id}/preview`)).body.data.previewWishes).toEqual([]);
  expect((await admin('delete',`guests/${f.guest.id}`).send({expectedVersion:f.guest.version})).status).toBe(204);
  expect(await prisma.rSVP.count()).toBe(0);
  expect(await prisma.wish.count()).toBe(0);
  expect(await prisma.guest.count()).toBe(0);
 });
 it('returns the same result to simultaneous retries of one idempotent create',async()=>{
  const key=randomUUID(),body={status:'ATTENDING',note:'One submission',expectedVersion:0};
  const results=await Promise.all([1,2].map(()=>guest('put','rsvp').set('Idempotency-Key',key).send(body)));
  expect(results.map(r=>r.status)).toEqual([200,200]);
  expect(results[0].body.data).toEqual(results[1].body.data);
  expect(await prisma.rSVP.count()).toBe(1);
  expect(await prisma.idempotencyRecord.count()).toBe(1);
 });
 it('closes at the server deadline and does not let admin access another owner event',async()=>{
  const revision=await prisma.eventRevision.create({data:{eventId:f.event.id,revisionNo:2,contentJson:{...f.content,rsvpDeadline:'2020-01-01T00:00:00Z',wishDeadline:'2020-01-01T00:00:00Z'}}});
  await prisma.event.update({where:{id:f.event.id},data:{publishedRevisionId:revision.id}});
  expect((await guest('get','invitation')).body.data.canRsvp).toBe(false);
  expect((await guest('put','rsvp').set('Idempotency-Key',randomUUID()).send({status:'ATTENDING',expectedVersion:0})).status).toBe(422);
  expect((await guest('put','wish').set('Idempotency-Key',randomUUID()).send({body:'Late',consentPublic:false,expectedVersion:0})).status).toBe(422);
  const owner=await prisma.adminUser.create({data:{email:'other@example.test',passwordHash:'unusable'}});
  const event=await prisma.event.create({data:{ownerId:owner.id,slug:'other'}});
  expect((await admin('get',`events/${event.id}/dashboard`)).status).toBe(404);
  expect((await admin('get',`events/${event.id}/preview`)).status).toBe(404);
 });
 it('replays identical writes, rejects changed replay, and permits only one concurrent creation',async()=>{
  const key=randomUUID(),body={status:'ATTENDING',note:'See you',expectedVersion:0};
  const first=await guest('put','rsvp').set('Idempotency-Key',key).send(body);
  expect(first.status).toBe(200);
  const replay=await guest('put','rsvp').set('Idempotency-Key',key).send(body);
  expect(replay.body.data).toEqual(first.body.data);
  expect((await guest('put','rsvp').set('Idempotency-Key',key).send({...body,status:'DECLINED'})).status).toBe(409);
  const outcomes=await Promise.all(['ATTENDING','DECLINED'].map(status=>guest('put','rsvp').set('Idempotency-Key',randomUUID()).send({status,expectedVersion:1})));
  expect(outcomes.map(r=>r.status).sort()).toEqual([200,409]);
  expect(await prisma.rSVP.count()).toBe(1);
 });
 it('publishes consented wishes on create and edit and allows withdrawal after writes close',async()=>{
  const viewer=await admin('post',`events/${f.event.id}/guests`).send({guestCode:'WALL-VIEWER',fullName:'Wall viewer'});
  expect(viewer.status).toBe(201);
  const link=await admin('get',`invitations/${viewer.body.data.invitation.id}/link`);
  const token=credentialFromLink(link.body.data.url);
  const saved=await guest('put','wish').set('Idempotency-Key',randomUUID()).send({body:'Congratulations',consentPublic:true,expectedVersion:0});
  expect(saved.status).toBe(200);
  const wish=saved.body.data;
  expect(wish).toMatchObject({moderationStatus:'APPROVED',approvedAt:expect.any(String),version:1});
  expect(wish).not.toHaveProperty('invitationId');
  expect(wish).not.toHaveProperty('approvedBy');
  expect((await prisma.wish.findUniqueOrThrow({where:{id:wish.id}})).approvedBy).toBeNull();
  expect((await guest('get','wishes',token)).body.data.items[0]).toMatchObject({body:'Congratulations'});
  expect((await admin('patch',`wishes/${wish.id}/pin`).send({isPinned:true,expectedVersion:1})).status).toBe(200);
  const edited=await guest('put','wish').set('Idempotency-Key',randomUUID()).send({body:'A new message',consentPublic:true,expectedVersion:2});
  expect(edited.body.data).toMatchObject({moderationStatus:'APPROVED',isPinned:false,version:3});
  expect((await guest('get','wishes',token)).body.data.items[0]).toMatchObject({body:'A new message',isPinned:false});
  expect((await admin('patch',`wishes/${wish.id}/moderation`).send({action:'HIDE',expectedVersion:2})).status).toBe(409);
  await admin('patch',`events/${f.event.id}/controls`).send({expectedVersion:f.event.version,wishesEnabled:false});
  expect((await guest('put','wish').set('Idempotency-Key',randomUUID()).send({body:'Blocked',consentPublic:true,expectedVersion:3})).status).toBe(422);
  const withdrawn=await guest('patch','wish/visibility').send({consentPublic:false,expectedVersion:3});
  expect(withdrawn.status).toBe(200);
  expect(withdrawn.body.data).toMatchObject({body:'A new message',moderationStatus:'NONE',approvedAt:null});
  expect((await guest('get','wishes',token)).body.data.items).toEqual([]);
  expect((await guest('patch','wish/visibility').send({consentPublic:false,expectedVersion:4,body:'Bypass'})).status).toBe(400);
  expect((await guest('delete','wish').send({expectedVersion:4})).status).toBe(204);
  expect((await guest('get','invitation')).body.data.wish.deletedAt).toBeTruthy();
 });
 it('lets admins hide and restore public wishes and tracks the public count',async()=>{
  const saved=await guest('put','wish').set('Idempotency-Key',randomUUID()).send({body:'Public message',consentPublic:true,expectedVersion:0});
  expect(saved.status).toBe(200);
  const path=`wishes/${saved.body.data.id}/moderation`,dashboard=`events/${f.event.id}/dashboard`;
  expect((await admin('get',dashboard)).body.data.publicWishes).toBe(1);
  expect((await admin('patch',path).send({action:'APPROVE',expectedVersion:1})).status).toBe(422);
  expect((await admin('patch',path).send({action:'HIDE',expectedVersion:1})).body.data).toMatchObject({moderationStatus:'HIDDEN',approvedAt:null});
  expect((await admin('get',dashboard)).body.data.publicWishes).toBe(0);
  expect((await guest('put','wish').set('Idempotency-Key',randomUUID()).send({body:'Edited while hidden',consentPublic:true,expectedVersion:2})).body.data).toMatchObject({moderationStatus:'HIDDEN',approvedAt:null});
  expect((await guest('patch','wish/visibility').send({consentPublic:false,expectedVersion:3})).body.data).toMatchObject({moderationStatus:'HIDDEN',consentPublic:false});
  expect((await admin('patch',path).send({action:'HIDE',expectedVersion:4})).body.data).toMatchObject({moderationStatus:'HIDDEN',consentPublic:false});
  expect((await guest('put','wish').set('Idempotency-Key',randomUUID()).send({body:'Reshared while hidden',consentPublic:true,expectedVersion:5})).body.data).toMatchObject({moderationStatus:'HIDDEN'});
  expect((await admin('get',dashboard)).body.data.publicWishes).toBe(0);
  expect((await admin('patch',path).send({action:'APPROVE',expectedVersion:6})).body.data).toMatchObject({moderationStatus:'APPROVED',approvedBy:f.admin.id});
  expect((await admin('get',dashboard)).body.data.publicWishes).toBe(1);
 });
 it('can show legacy consented wishes left pending before instant publication',async()=>{
  const legacy=await prisma.wish.create({data:{invitationId:f.invitation.id,body:'Legacy wish',consentPublic:true,moderationStatus:'PENDING'}});
  const result=await admin('patch',`wishes/${legacy.id}/moderation`).send({action:'APPROVE',expectedVersion:legacy.version});
  expect(result.status).toBe(200);
  expect(result.body.data).toMatchObject({moderationStatus:'APPROVED',approvedBy:f.admin.id});
 });
 it('never replays a revoked token and rotation preserves response history',async()=>{
  const key=randomUUID(),body={status:'DECLINED',expectedVersion:0};
  expect((await guest('put','rsvp').set('Idempotency-Key',key).send(body)).status).toBe(200);
  expect((await admin('post',`invitations/${f.invitation.id}/revoke`).send({expectedVersion:1})).status).toBe(200);
  expect((await guest('put','rsvp').set('Idempotency-Key',key).send(body)).status).toBe(404);
  expect((await admin('post',`invitations/${f.invitation.id}/rotate`).send({expectedVersion:2})).status).toBe(200);
  const link=await admin('get',`invitations/${f.invitation.id}/link`);
  const newToken=credentialFromLink(link.body.data.url);
  expect(newToken).not.toBe(f.token);
  expect((await guest('get','invitation',newToken)).body.data.rsvp.status).toBe('DECLINED');
  expect((await guest('get','invitation')).status).toBe(401);
 });
 it('paginates only safe approved wishes with pinned entries first',async()=>{
  for(let i=0;i<8;i++){
   const created=await admin('post',`events/${f.event.id}/guests`).send({guestCode:`WALL${i}`,fullName:`Wall guest ${i}`});
   expect(created.status).toBe(201);
   await prisma.wish.create({data:{invitationId:created.body.data.invitation.id,body:`Message ${i}`,consentPublic:i!==7,moderationStatus:i===7?'NONE':'APPROVED',isPinned:i===0,approvedAt:i===7?null:new Date(`2026-11-0${i+1}T00:00:00Z`)}});
  }
  const first=await guest('get','wishes');
  expect(first.status).toBe(200);
  expect(first.body.data.items).toHaveLength(6);
  expect(first.body.data.items[0].body).toBe('Message 0');
  expect(Object.keys(first.body.data.items[0]).sort()).toEqual(['approvedAt','attendanceStatus','body','displayName','id','isPinned']);
  expect(first.body.data.nextCursor).toBeTruthy();
  const second=await guest('get',`wishes?cursor=${encodeURIComponent(first.body.data.nextCursor)}`);
  expect(second.body.data.items).toHaveLength(1);
  expect(second.body.data.nextCursor).toBeNull();
  expect(new Set([...first.body.data.items,...second.body.data.items].map((w:any)=>w.id)).size).toBe(7);
  expect((await guest('get','wishes?cursor=invalid')).status).toBe(400);
  expect((await guest('get','wishes?limit=21')).status).toBe(400);
 });
 it('shows public wishes from other guests and shares attendance only with separate consent',async()=>{
  const writer=await admin('post',`events/${f.event.id}/guests`).send({guestCode:'WISH-WRITER',fullName:'Người gửi lời chúc'});
  expect(writer.status).toBe(201);
  const link=await admin('get',`invitations/${writer.body.data.invitation.id}/link`);
  const token=credentialFromLink(link.body.data.url);
  expect((await guest('put','rsvp',token).set('Idempotency-Key',randomUUID()).send({status:'ATTENDING',note:'Private note',expectedVersion:0})).status).toBe(200);
  const own=await prisma.wish.create({data:{invitationId:f.invitation.id,body:'Own message',consentPublic:true,moderationStatus:'APPROVED',approvedAt:new Date()}});
  const wish=await guest('put','wish',token).set('Idempotency-Key',randomUUID()).send({body:'Lời chúc đã đồng ý',consentPublic:true,consentAttendancePublic:true,expectedVersion:0});
  expect(wish.status).toBe(200);
  const wall=(await guest('get','wishes')).body.data.items;
  expect(wall).toHaveLength(1);
  expect(wall[0]).toMatchObject({body:'Lời chúc đã đồng ý',displayName:'Người gửi lời chúc',attendanceStatus:'ATTENDING'});
  expect(wall[0].id).not.toBe(own.id);
  expect(JSON.stringify(wall)).not.toContain('Private note');
  const preview=await admin('get',`events/${f.event.id}/preview?guestId=${f.guest.id}`);
  expect(preview.status).toBe(200);
  expect(preview.body.data.previewWishes).toEqual(wall);
  const updated=await guest('put','wish',token).set('Idempotency-Key',randomUUID()).send({body:'Chỉ chia sẻ lời chúc',consentPublic:true,expectedVersion:1});
  expect(updated.status).toBe(200);
  expect((await guest('get','wishes')).body.data.items[0]).toMatchObject({body:'Chỉ chia sẻ lời chúc',attendanceStatus:null});
  const privateWish=await guest('put','wish',token).set('Idempotency-Key',randomUUID()).send({body:'Chỉ gửi riêng',consentPublic:false,consentAttendancePublic:true,expectedVersion:2});
  expect(privateWish.body.data).toMatchObject({moderationStatus:'NONE',approvedAt:null,consentAttendancePublic:false});
  expect((await guest('get','wishes')).body.data.items).toEqual([]);
 });
});
describe('admin guest lifecycle and summary',()=>{
 it('deletes the guest and responses, invalidates every link, and reserves used short codes',async()=>{
  const linkPath=`invitations/${f.invitation.id}/link`,guestPath=`guests/${f.guest.id}`;
  const original=credentialFromLink((await admin('get',linkPath)).body.data.url);
  const renamed=await admin('patch',guestPath).send({
   guestCode:f.guest.guestCode,fullName:'Khách đổi tên',expectedVersion:1,expectedInvitationVersion:1,
  });
  expect(renamed.status).toBe(200);
  const second=credentialFromLink((await admin('get',linkPath)).body.data.url);
  await expect(prisma.invitationLink.updateMany({where:{invitationId:f.invitation.id},data:{invitationId:null}})).rejects.toThrow();
  const rsvpKey=randomUUID(),rsvp={status:'ATTENDING',note:'Có mặt',expectedVersion:0};
  expect((await guest('put','rsvp',original).set('Idempotency-Key',rsvpKey).send(rsvp)).status).toBe(200);
  const wish=await guest('put','wish',second).set('Idempotency-Key',randomUUID()).send({body:'Chúc mừng tốt nghiệp',consentPublic:true,expectedVersion:0});
  expect(wish.status).toBe(200);
  const other=await setupTestData();
  const currentVersion=renamed.body.data.version;
  expect((await request(app).delete(`/api/v1/admin/${guestPath}`).set('Origin','http://localhost:5173').set('Cookie',other.cookie).set('X-CSRF-Token',other.csrf).send({expectedVersion:currentVersion})).status).toBe(404);
  expect((await admin('delete',guestPath).send({expectedVersion:1})).status).toBe(409);
  expect((await guest('get','invitation',original)).status).toBe(200);

  expect((await admin('delete',guestPath).send({expectedVersion:currentVersion})).status).toBe(204);
  expect((await admin('get',`events/${f.event.id}/guests?archived=all`)).body.data.total).toBe(0);
  expect((await admin('get',`events/${f.event.id}/dashboard`)).body.data.total).toBe(0);
  expect((await admin('get',linkPath)).status).toBe(404);
  expect((await admin('delete',guestPath).send({expectedVersion:currentVersion})).status).toBe(404);
  for(const credential of [original,second,f.token])expect((await guest('get','invitation',credential)).status).toBe(401);
  expect((await guest('put','rsvp',original).set('Idempotency-Key',rsvpKey).send(rsvp)).status).toBe(401);
  expect((await guest('get','invitation',other.token)).status).toBe(200);
  expect(await prisma.invitation.count({where:{id:f.invitation.id}})).toBe(0);
  expect(await prisma.rSVP.count({where:{invitationId:f.invitation.id}})).toBe(0);
  expect(await prisma.wish.count({where:{invitationId:f.invitation.id}})).toBe(0);
  expect(await prisma.idempotencyRecord.count({where:{actorKeyHash:tokens.hashToken(f.invitation.id)}})).toBe(0);
  expect(await prisma.auditLog.count({where:{entityId:f.guest.id,action:'GUEST_DELETED'}})).toBe(1);
  const retired=await prisma.invitationLink.findMany({where:{invitationId:null}});
  expect(retired).toHaveLength(2);
  for(const alias of retired)expect(alias).toMatchObject({tokenHash:'',restoredTokenHash:null,slug:'',codeCiphertext:'',keyVersion:''});

  const oldCode=original.split('.')[0],newCode=oldCode==='Z9q8R'?'N7k6M':'Z9q8R';
  const random=vi.spyOn(tokens,'createInvitationLinkCode').mockReturnValueOnce(oldCode).mockReturnValueOnce(newCode);
  const originalKeys={invitationKey:config.invitationKey,invitationKeyVersion:config.invitationKeyVersion,invitationOldKeys:config.invitationOldKeys};
  try{
   Object.assign(config,{invitationKey:randomBytes(32).toString('base64'),invitationKeyVersion:'test-rotated',invitationOldKeys:{}});
   const replacement=await admin('post',`events/${f.event.id}/guests`).send({guestCode:f.guest.guestCode,fullName:f.guest.fullName});
   expect(replacement.status).toBe(201);
   const link=await admin('get',`invitations/${replacement.body.data.invitation.id}/link`);
   expect(link.status).toBe(200);
   const credential=credentialFromLink(link.body.data.url);
   expect(credential.split('.')[0]).toBe(newCode);
   expect((await guest('get','invitation',credential)).status).toBe(200);
   expect((await guest('get','invitation',original)).status).toBe(401);
  }finally{random.mockRestore();Object.assign(config,originalKeys);}
 });
 it('handles simultaneous deletes without leaving any active invitation',async()=>{
  const path=`guests/${f.guest.id}`;
  const results=await Promise.all([1,2].map(()=>admin('delete',path).send({expectedVersion:f.guest.version})));
  expect(results.map(result=>result.status).sort()).toEqual([204,404]);
  expect((await guest('get','invitation')).status).toBe(401);
  expect(await prisma.auditLog.count({where:{entityId:f.guest.id,action:'GUEST_DELETED'}})).toBe(1);
 });
 it('creates normalized guests atomically, rejects duplicates, and requires reasons for admin responses',async()=>{
  const created=await admin('post',`events/${f.event.id}/guests`).send({guestCode:'test_2',fullName:'Second guest',phone:'0123456',personalMessage:'Hello'});
  expect(created.status).toBe(201);
  expect(created.body.data.guestCode).toBe('TEST_2');
  expect(created.body.data.phone).toBe('0123456');
  expect(created.body.data.invitation.personalMessage).toBe('Hello');
  expect((await admin('post',`events/${f.event.id}/guests`).send({guestCode:'TEST_2',fullName:'Duplicate'})).status).toBe(409);
  expect(await prisma.guest.count()).toBe(2);
  expect(await prisma.invitation.count()).toBe(2);
  const id=created.body.data.invitation.id;
  expect((await admin('put',`invitations/${id}/rsvp`).send({status:'ATTENDING',expectedVersion:0})).status).toBe(400);
  expect((await admin('put',`invitations/${id}/rsvp`).send({status:'ATTENDING',expectedVersion:0,reason:'Confirmed by phone'})).status).toBe(200);
  const dashboard=(await admin('get',`events/${f.event.id}/dashboard`)).body.data;
  expect(dashboard).toMatchObject({total:2,attending:1,declined:0,unanswered:1});
  const filtered=await admin('get',`events/${f.event.id}/guests?status=ATTENDING&q=Second`);
  expect(filtered.body.data.total).toBe(1);
  expect(filtered.body.data.items[0].guestCode).toBe('TEST_2');
  expect((await admin('get',`events/${f.event.id}/guests?sort=invalid`)).status).toBe(400);
 });
 it('treats empty UI filter values as omitted while retaining grouped guests',async()=>{
  await prisma.guest.update({where:{id:f.guest.id},data:{groupKey:'friends'}});
  const guests=await admin('get',`events/${f.event.id}/guests?q=&group=&status=&archived=false`);
  expect(guests.status).toBe(200);
  expect(guests.body.data.total).toBe(1);
  expect((await admin('get',`events/${f.event.id}/wishes?status=`)).status).toBe(200);
 });
 it('keeps issued links valid on name edits, preserves revocation on restore, and excludes inactive invitations',async()=>{
  const original=(await admin('get',`invitations/${f.invitation.id}/link`)).body.data.url;
  const edit=await admin('patch',`guests/${f.guest.id}`).send({guestCode:f.guest.guestCode,fullName:'Renamed',expectedVersion:1,expectedInvitationVersion:1});
  expect(edit.status).toBe(200);
  const renamed=(await admin('get',`invitations/${f.invitation.id}/link`)).body.data.url;expect(renamed).toMatch(/\/renamed$/);
  expect((await guest('get','invitation',credentialFromLink(original))).body.data.guest.fullName).toBe('Renamed');
  expect((await guest('get','invitation',credentialFromLink(renamed))).status).toBe(200);
  expect(JSON.stringify(edit.body)).not.toMatch(/tokenHash|tokenCiphertext|keyVersion/);
  await admin('post',`invitations/${f.invitation.id}/revoke`).send({expectedVersion:1});
  await admin('post',`guests/${f.guest.id}/archive`).send({expectedVersion:2});
  await admin('post',`guests/${f.guest.id}/restore`).send({expectedVersion:3});
  expect((await guest('get','invitation')).status).toBe(404);
  const dashboard=await admin('get',`events/${f.event.id}/dashboard`);
  expect(dashboard.body.data).toMatchObject({total:0,attending:0,declined:0,unanswered:0});
 });
 it('counts opened once and serves a stable calendar without exposing other guest data',async()=>{
  expect((await guest('post','opened')).status).toBe(200);
  expect((await guest('post','opened')).status).toBe(200);
  expect((await admin('get',`events/${f.event.id}/dashboard`)).body.data.opened).toBe(1);
  const calendar=await guest('get','calendar.ics');
  expect(calendar.status).toBe(200);
  expect(calendar.headers['content-type']).toContain('text/calendar');
  expect(calendar.text).toContain(`UID:${f.event.id}@graduation-invitation`);
  expect(JSON.stringify((await guest('get','invitation')).body)).not.toMatch(/tokenHash|tokenCiphertext|keyVersion|@example/);
 });
});
describe('short invitation link allocation',()=>{
 it('restores the selected old alias alongside the current link until the next rotation',async()=>{
  const oldUrl=(await admin('get',`invitations/${f.invitation.id}/link`)).body.data.url;
  const oldAlias=await prisma.invitationLink.findFirstOrThrow({where:{invitationId:f.invitation.id}});
  expect((await admin('post',`invitations/${f.invitation.id}/rotate`).send({expectedVersion:1})).status).toBe(200);
  const currentUrl=(await admin('get',`invitations/${f.invitation.id}/link`)).body.data.url;
  const current=await prisma.invitation.findUniqueOrThrow({where:{id:f.invitation.id}});
  expect((await guest('get','invitation',credentialFromLink(oldUrl))).status).toBe(401);
  await prisma.invitationLink.update({where:{codeHash:oldAlias.codeHash},data:{restoredTokenHash:current.tokenHash}});
  expect((await guest('get','invitation',credentialFromLink(oldUrl))).status).toBe(200);
  expect((await guest('get','invitation',credentialFromLink(currentUrl))).status).toBe(200);
  expect((await guest('get','invitation',f.token)).status).toBe(401);
  expect((await admin('get',`invitations/${f.invitation.id}/link`)).body.data.url).toBe(oldUrl);
  expect((await admin('post',`invitations/${f.invitation.id}/rotate`).send({expectedVersion:2})).status).toBe(200);
  expect((await guest('get','invitation',credentialFromLink(oldUrl))).status).toBe(401);
 });
 it('shares one stable alias between simultaneous requests',async()=>{
  const responses=await Promise.all([1,2,3].map(()=>admin('get',`invitations/${f.invitation.id}/link`)));
  expect(responses.map(r=>r.status)).toEqual([200,200,200]);expect(new Set(responses.map(r=>r.body.data.url)).size).toBe(1);
  expect(await prisma.invitationLink.count({where:{invitationId:f.invitation.id}})).toBe(1);
 });
 it('resamples collisions and separates guests with the same name',async()=>{
  const first=(await admin('get',`invitations/${f.invitation.id}/link`)).body.data.url,code=new URL(first).pathname.split('/')[2],replacement=code==='Z9q8R'?'N7k6M':'Z9q8R';
  const second=await admin('post',`events/${f.event.id}/guests`).send({guestCode:'SAME-NAME',fullName:f.guest.fullName,displayName:'Khách thứ hai'});
  const random=vi.spyOn(tokens,'createInvitationLinkCode').mockReturnValueOnce(code).mockReturnValueOnce(replacement);
  try{const link=await admin('get',`invitations/${second.body.data.invitation.id}/link`);expect(link.status).toBe(200);expect(new URL(link.body.data.url).pathname.split('/')[2]).toBe(replacement);
   expect((await guest('get','invitation',credentialFromLink(link.body.data.url))).body.data.guest.displayName).toBe('Khách thứ hai');
   expect((await guest('get','invitation',credentialFromLink(first))).body.data.guest.displayName).toBe(f.guest.displayName);
  }finally{random.mockRestore();}
 });
 it('invalidates every old alias on rotation while preserving responses and the legacy capability before rotation',async()=>{
  const first=(await admin('get',`invitations/${f.invitation.id}/link`)).body.data.url;
  expect((await guest('put','rsvp',credentialFromLink(first)).set('Idempotency-Key',randomUUID()).send({status:'ATTENDING',expectedVersion:0})).status).toBe(200);
  await admin('patch',`guests/${f.guest.id}`).send({guestCode:f.guest.guestCode,fullName:'Tên mới',expectedVersion:1,expectedInvitationVersion:1});
  const second=(await admin('get',`invitations/${f.invitation.id}/link`)).body.data.url;
  expect((await guest('get','invitation',credentialFromLink(first))).status).toBe(200);expect((await guest('get','invitation')).status).toBe(200);
  expect((await admin('post',`invitations/${f.invitation.id}/rotate`).send({expectedVersion:1})).status).toBe(200);
  for(const token of [credentialFromLink(first),credentialFromLink(second),f.token])expect((await guest('get','invitation',token)).status).toBe(401);
  const current=(await admin('get',`invitations/${f.invitation.id}/link`)).body.data.url;
  expect((await guest('get','invitation',credentialFromLink(current))).body.data.rsvp.status).toBe('ATTENDING');
 });
});

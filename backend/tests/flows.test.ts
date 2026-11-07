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
 it('removes edited, withdrawn and deleted wishes from the wall, including after writes close',async()=>{
  const viewer=await admin('post',`events/${f.event.id}/guests`).send({guestCode:'WALL-VIEWER',fullName:'Wall viewer'});
  expect(viewer.status).toBe(201);
  const link=await admin('get',`invitations/${viewer.body.data.invitation.id}/link`);
  const token=credentialFromLink(link.body.data.url);
  const saved=await guest('put','wish').set('Idempotency-Key',randomUUID()).send({body:'Congratulations',consentPublic:true,expectedVersion:0});
  expect(saved.status).toBe(200);
  const wish=saved.body.data;
  expect(wish).not.toHaveProperty('invitationId');
  expect(wish).not.toHaveProperty('approvedBy');
  expect((await admin('patch',`wishes/${wish.id}/moderation`).send({action:'APPROVE',expectedVersion:1})).status).toBe(200);
  expect((await guest('get','wishes',token)).body.data.items).toHaveLength(1);
  const edited=await guest('put','wish').set('Idempotency-Key',randomUUID()).send({body:'A new message',consentPublic:true,expectedVersion:2});
  expect(edited.body.data.moderationStatus).toBe('PENDING');
  expect((await guest('get','wishes',token)).body.data.items).toHaveLength(0);
  expect((await admin('patch',`wishes/${wish.id}/moderation`).send({action:'APPROVE',expectedVersion:2})).status).toBe(409);
  await admin('patch',`events/${f.event.id}/controls`).send({expectedVersion:f.event.version,wishesEnabled:false});
  expect((await guest('put','wish').set('Idempotency-Key',randomUUID()).send({body:'Blocked',consentPublic:true,expectedVersion:3})).status).toBe(422);
  const withdrawn=await guest('patch','wish/visibility').send({consentPublic:false,expectedVersion:3});
  expect(withdrawn.status).toBe(200);
  expect(withdrawn.body.data.body).toBe('A new message');
  expect((await guest('patch','wish/visibility').send({consentPublic:false,expectedVersion:4,body:'Bypass'})).status).toBe(400);
  expect((await guest('delete','wish').send({expectedVersion:4})).status).toBe(204);
  expect((await guest('get','invitation')).body.data.wish.deletedAt).toBeTruthy();
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
 it('shows approved wishes from other guests and shares attendance only with separate consent',async()=>{
  const writer=await admin('post',`events/${f.event.id}/guests`).send({guestCode:'WISH-WRITER',fullName:'Người gửi lời chúc'});
  expect(writer.status).toBe(201);
  const link=await admin('get',`invitations/${writer.body.data.invitation.id}/link`);
  const token=credentialFromLink(link.body.data.url);
  expect((await guest('put','rsvp',token).set('Idempotency-Key',randomUUID()).send({status:'ATTENDING',note:'Private note',expectedVersion:0})).status).toBe(200);
  const own=await prisma.wish.create({data:{invitationId:f.invitation.id,body:'Own message',consentPublic:true,moderationStatus:'APPROVED',approvedAt:new Date()}});
  const wish=await guest('put','wish',token).set('Idempotency-Key',randomUUID()).send({body:'Lời chúc đã đồng ý',consentPublic:true,consentAttendancePublic:true,expectedVersion:0});
  expect(wish.status).toBe(200);
  expect((await guest('get','wishes')).body.data.items).toEqual([]);
  expect((await admin('patch',`wishes/${wish.body.data.id}/moderation`).send({action:'APPROVE',expectedVersion:1})).status).toBe(200);
  const wall=(await guest('get','wishes')).body.data.items;
  expect(wall).toHaveLength(1);
  expect(wall[0]).toMatchObject({body:'Lời chúc đã đồng ý',displayName:'Người gửi lời chúc',attendanceStatus:'ATTENDING'});
  expect(wall[0].id).not.toBe(own.id);
  expect(JSON.stringify(wall)).not.toContain('Private note');
  const preview=await admin('get',`events/${f.event.id}/preview?guestId=${f.guest.id}`);
  expect(preview.status).toBe(200);
  expect(preview.body.data.previewWishes).toEqual(wall);
  const updated=await guest('put','wish',token).set('Idempotency-Key',randomUUID()).send({body:'Chỉ chia sẻ lời chúc',consentPublic:true,expectedVersion:2});
  expect(updated.status).toBe(200);
  expect((await admin('patch',`wishes/${wish.body.data.id}/moderation`).send({action:'APPROVE',expectedVersion:3})).status).toBe(200);
  expect((await guest('get','wishes')).body.data.items[0]).toMatchObject({body:'Chỉ chia sẻ lời chúc',attendanceStatus:null});
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
  expect((await admin('patch',`wishes/${wish.body.data.id}/moderation`).send({action:'APPROVE',expectedVersion:1})).status).toBe(200);
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

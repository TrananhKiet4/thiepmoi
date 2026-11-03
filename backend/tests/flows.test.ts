import {beforeEach,describe,expect,it} from 'vitest';
import request from 'supertest';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import {prisma} from '../src/config/database.js';
import {resetTestDatabase,setupTestData} from './helpers.js';

const app=createApp();
let f:Awaited<ReturnType<typeof setupTestData>>;
const guest=(method:'get'|'post'|'put'|'patch'|'delete',path:string,token?:string)=>request(app)[method](`/api/v1/guest/${path}`).set('Authorization',`Bearer ${token??f.token}`);
const admin=(method:'get'|'post'|'put'|'patch',path:string)=>request(app)[method](`/api/v1/admin/${path}`).set('Cookie',f.cookie).set('Origin','http://localhost:5173').set('X-CSRF-Token',f.csrf);
beforeEach(async()=>{await resetTestDatabase();f=await setupTestData();});

describe('published invitation and immutable content',()=>{
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
  const saved=await guest('put','wish').set('Idempotency-Key',randomUUID()).send({body:'Congratulations',consentPublic:true,expectedVersion:0});
  expect(saved.status).toBe(200);
  const wish=saved.body.data;
  expect(wish).not.toHaveProperty('invitationId');
  expect(wish).not.toHaveProperty('approvedBy');
  expect((await admin('patch',`wishes/${wish.id}/moderation`).send({action:'APPROVE',expectedVersion:1})).status).toBe(200);
  expect((await guest('get','wishes')).body.data.items).toHaveLength(1);
  const edited=await guest('put','wish').set('Idempotency-Key',randomUUID()).send({body:'A new message',consentPublic:true,expectedVersion:2});
  expect(edited.body.data.moderationStatus).toBe('PENDING');
  expect((await guest('get','wishes')).body.data.items).toHaveLength(0);
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
  const newToken=link.body.data.url.split('/i/')[1];
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
  expect(Object.keys(first.body.data.items[0]).sort()).toEqual(['approvedAt','body','displayName','id','isPinned']);
  expect(first.body.data.nextCursor).toBeTruthy();
  const second=await guest('get',`wishes?cursor=${encodeURIComponent(first.body.data.nextCursor)}`);
  expect(second.body.data.items).toHaveLength(1);
  expect(second.body.data.nextCursor).toBeNull();
  expect(new Set([...first.body.data.items,...second.body.data.items].map((w:any)=>w.id)).size).toBe(7);
  expect((await guest('get','wishes?cursor=invalid')).status).toBe(400);
  expect((await guest('get','wishes?limit=21')).status).toBe(400);
 });
});
describe('admin guest lifecycle and summary',()=>{
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
 it('keeps links stable on edits, preserves revocation on restore, and excludes inactive invitations',async()=>{
  const original=(await admin('get',`invitations/${f.invitation.id}/link`)).body.data.url;
  const edit=await admin('patch',`guests/${f.guest.id}`).send({guestCode:f.guest.guestCode,fullName:'Renamed',expectedVersion:1,expectedInvitationVersion:1});
  expect(edit.status).toBe(200);
  expect((await admin('get',`invitations/${f.invitation.id}/link`)).body.data.url).toBe(original);
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

import {beforeEach,describe,it,expect} from 'vitest';
import request from 'supertest';
import {createApp} from '../src/app.js';
import {resetTestDatabase,setupTestData,credentialFromLink} from './helpers.js';
import {prisma} from '../src/config/database.js';
import {config} from '../src/config/env.js';
import {hash} from '@node-rs/argon2';
import {hashToken} from '../src/utils/token.js';

const app=createApp();let f:Awaited<ReturnType<typeof setupTestData>>;
beforeEach(async()=>{await resetTestDatabase();f=await setupTestData();});
describe('admin trust boundaries',()=>{
 it('limits short-code guessing by recipient name across IPs without counting valid reads',async()=>{
  const link=await request(app).get(`/api/v1/admin/invitations/${f.invitation.id}/link`).set('Cookie',f.cookie),credential=credentialFromLink(link.body.data.url),[code,slug]=credential.split('.'),wrong=(code==='ABCDE'?'FGHIJ':'ABCDE')+'.'+slug;
  const limited=createApp();limited.set('trust proxy',1);process.env.NODE_ENV='development';
  try{
   const valid=await Promise.all(Array.from({length:6},(_,i)=>request(limited).get('/api/v1/guest/invitation').set('X-Forwarded-For',`192.0.2.${i+30}`).set('Authorization','Bearer '+credential)));
   expect(valid.map(response=>response.status)).toEqual([200,200,200,200,200,200]);
   for(let i=0;i<6;i++)expect((await request(limited).put('/api/v1/guest/rsvp').set('X-Forwarded-For',`192.0.2.${i+60}`).set('Authorization','Bearer '+credential).send({})).status).toBe(400);
   for(let i=0;i<5;i++)expect((await request(limited).get('/api/v1/guest/invitation').set('X-Forwarded-For',`192.0.2.${i+40}`).set('Authorization','Bearer '+wrong)).status).toBe(401);
   expect((await request(limited).get('/api/v1/guest/invitation').set('X-Forwarded-For','192.0.2.50').set('Authorization','Bearer '+wrong)).status).toBe(429);
  }finally{process.env.NODE_ENV='test';}
 });
 it('returns a retryable response when the short-link lock is held',async()=>{
  const link=await request(app).get(`/api/v1/admin/invitations/${f.invitation.id}/link`).set('Cookie',f.cookie);
  expect(link.status).toBe(200);
  const credential=credentialFromLink(link.body.data.url),slug=credential.split('.')[1];
  const acquired=Promise.withResolvers<void>(),release=Promise.withResolvers<void>();
  const holding=prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'short-link-failures:'+hashToken(slug)},0))::text`;
   acquired.resolve();
   await release.promise;
  },{timeout:10000}).catch(error=>{acquired.reject(error);throw error;});
  process.env.NODE_ENV='development';
  const open=()=>request(app).get('/api/v1/guest/invitation').set('Authorization','Bearer '+credential);
  try{
   await acquired.promise;
   const blocked=await open().timeout({deadline:6000});
   expect(blocked.status).toBe(503);
   expect(blocked.body.error.code).toBe('DATABASE_BUSY');
   expect(blocked.headers['retry-after']).toBe('2');
  }finally{
   release.resolve();
   process.env.NODE_ENV='test';
   await holding;
  }
  process.env.NODE_ENV='development';
  try{expect((await open()).status).toBe(200);}finally{process.env.NODE_ENV='test';}
 });
 it('logs in as admin using the configured account and its stored password hash',async()=>{
  const previous=config.adminBootstrapEmail;config.adminBootstrapEmail=f.admin.email;
  try{
   await prisma.adminUser.update({where:{id:f.admin.id},data:{passwordHash:await hash('Alias-test-password!')}});
   const login=await request(app).post('/api/v1/admin/auth/login').set('Origin',config.appOrigin).send({email:'admin',password:'Alias-test-password!'});
   expect(login.status).toBe(200);expect(login.body.data.id).toBe(f.admin.id);expect(login.body.data.email).toBe(f.admin.email);
   expect((await request(app).post('/api/v1/admin/auth/login').set('Origin',config.appOrigin).send({email:'admin',password:'wrong-password'})).status).toBe(401);
  }finally{config.adminBootstrapEmail=previous;}
 });
 it('refuses the admin alias without a configured account or when that account is disabled',async()=>{
  const previous=config.adminBootstrapEmail;
  try{
   config.adminBootstrapEmail='';
   expect((await request(app).post('/api/v1/admin/auth/login').set('Origin',config.appOrigin).send({email:'admin',password:'Alias-test-password!'})).status).toBe(401);
   config.adminBootstrapEmail=f.admin.email;
   await prisma.adminUser.update({where:{id:f.admin.id},data:{passwordHash:await hash('Alias-test-password!'),disabledAt:new Date()}});
   expect((await request(app).post('/api/v1/admin/auth/login').set('Origin',config.appOrigin).send({email:'admin',password:'Alias-test-password!'})).status).toBe(401);
  }finally{config.adminBootstrapEmail=previous;}
 });
 it('limits failed login attempts by IP even when account names change',async()=>{
  process.env.NODE_ENV='development';
  try{let last;for(let i=0;i<6;i++)last=await request(app).post('/api/v1/admin/auth/login').set('Origin','http://localhost:5173').send({email:`unknown-${i}@example.test`,password:'wrong-password'});
   expect(last!.status).toBe(429);expect(last!.headers['retry-after']).toBeTruthy();
  }finally{process.env.NODE_ENV='test';}
 });
 it('shares the account failure limit between admin and its email across different IPs',async()=>{
  const previous=config.adminBootstrapEmail,limited=createApp();config.adminBootstrapEmail=f.admin.email;limited.set('trust proxy',1);process.env.NODE_ENV='development';
  try{
   for(let i=0;i<5;i++)expect((await request(limited).post('/api/v1/admin/auth/login').set('Origin',config.appOrigin).set('X-Forwarded-For',`192.0.2.${i+1}`).send({email:i%2?'admin':f.admin.email,password:'wrong-password'})).status).toBe(401);
   expect((await request(limited).post('/api/v1/admin/auth/login').set('Origin',config.appOrigin).set('X-Forwarded-For','192.0.2.6').send({email:'admin',password:'wrong-password'})).status).toBe(429);
  }finally{config.adminBootstrapEmail=previous;process.env.NODE_ENV='test';}
 });
 it('rejects wrong origin, missing CSRF and guest-token access to admin',async()=>{
  expect((await request(app).post('/api/v1/admin/auth/login').set('Origin','https://untrusted.test').send({email:f.admin.email,password:'TestOnly-Password-12345'})).status).toBe(403);
  expect((await request(app).post('/api/v1/admin/auth/logout').set('Cookie',f.cookie).set('Origin','http://localhost:5173')).status).toBe(403);
  expect((await request(app).get('/api/v1/admin/auth/me').set('Authorization',`Bearer ${f.token}`)).status).toBe(401);
 });
 it('revokes server session and clears cookie on logout',async()=>{
  const out=await request(app).post('/api/v1/admin/auth/logout').set('Cookie',f.cookie).set('Origin','http://localhost:5173').set('X-CSRF-Token',f.csrf).send({});
  expect(out.status).toBe(204);expect((await request(app).get('/api/v1/admin/auth/me').set('Cookie',f.cookie)).status).toBe(401);
  expect(await prisma.adminSession.count({where:{revokedAt:{not:null}}})).toBe(1);
 });
 it('expires sessions, sends no-store and no-referrer headers',async()=>{
  const me=await request(app).get('/api/v1/admin/auth/me').set('Cookie',f.cookie);
  expect(me.headers['cache-control']).toContain('no-store');expect(me.headers['referrer-policy']).toBe('no-referrer');
  await prisma.adminSession.updateMany({where:{adminId:f.admin.id},data:{expiresAt:new Date(0)}});
  expect((await request(app).get('/api/v1/admin/auth/me').set('Cookie',f.cookie)).status).toBe(401);
 });
 it('enforces real PostgreSQL ownership and revision immutability constraints',async()=>{
  const other=await prisma.event.create({data:{ownerId:f.admin.id,slug:'other-event'}});
  await expect(prisma.event.update({where:{id:other.id},data:{publishedRevisionId:f.event.publishedRevisionId}})).rejects.toThrow();
  await expect(prisma.eventRevision.update({where:{id:f.event.draftRevisionId!},data:{contentJson:{leaked:true}}})).rejects.toThrow();
  await expect(prisma.invitation.update({where:{id:f.invitation.id},data:{eventId:other.id}})).rejects.toThrow();
 });
});

import {beforeEach,describe,it,expect} from 'vitest';
import request from 'supertest';
import {createApp} from '../src/app.js';
import {resetTestDatabase,setupTestData} from './helpers.js';
import {prisma} from '../src/config/database.js';
import {config} from '../src/config/env.js';
import {hash} from '@node-rs/argon2';

const app=createApp();let f:Awaited<ReturnType<typeof setupTestData>>;
beforeEach(async()=>{await resetTestDatabase();f=await setupTestData();});
describe('admin trust boundaries',()=>{
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

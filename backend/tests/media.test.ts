import {beforeEach,describe,expect,it} from 'vitest';
import sharp from 'sharp';
import {processMedia} from '../src/services/media-processing.service.js';
import request from 'supertest';
import {createApp} from '../src/app.js';
import {prisma} from '../src/config/database.js';
import {setupTestData,resetTestDatabase} from './helpers.js';
import {preparePublishedMedia,mediaUrls} from '../src/services/media.service.js';
import {copyPublic} from '../src/services/storage.service.js';
import {config} from '../src/config/env.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import {join} from 'node:path';

describe('media validation',()=>{
 it('rejects forged image and unsupported SVG',async()=>{
  await expect(processMedia(Buffer.from('<svg></svg>'),'image.png')).rejects.toThrow();
 });
 it('decodes images, drops metadata and creates bounded WebP variants',async()=>{
  const image=await sharp({create:{width:1600,height:900,channels:3,background:'red'}}).jpeg().toBuffer();
  const result=await processMedia(image,'photo.jpg');
  expect(result.type).toBe('IMAGE');expect(result.width).toBe(1600);
  expect(result.files.map(f=>f.width)).toEqual([640,1280,1600]);
  expect((await sharp(result.files[0].bytes).metadata()).exif).toBeUndefined();
 });
 it('rejects files above 10 MB',async()=>{
  await expect(processMedia(Buffer.alloc(10*1024*1024+1),'photo.jpg')).rejects.toThrow(/10 MB/);
 });
 it('sizes rotated photos after orientation so storage keys remain unique',async()=>{
  const image=await sharp({create:{width:1600,height:900,channels:3,background:'blue'}}).withMetadata({orientation:6}).jpeg().toBuffer();
  const result=await processMedia(image,'rotated.jpg');
  expect(result.files.map(f=>f.width)).toEqual([360,720,900]);
  expect(result.height).toBe(1600);
 });
 it('refuses metadata-only audio acceptance when its decoder is unavailable',async()=>{
  const frame=Buffer.alloc(417);frame.set([255,251,144,0]);const mp3=Buffer.concat(Array(40).fill(frame));
  await expect(processMedia(mp3,'silence.mp3','decoder-that-does-not-exist')).rejects.toMatchObject({code:'AUDIO_DECODER_UNAVAILABLE'});
 });
 it('rejects MPEG Layer 2 renamed as MP3 before invoking a decoder',async()=>{
  const frame=Buffer.alloc(522);frame.set([255,253,144,0]);const mp2=Buffer.concat(Array(40).fill(frame));
  await expect(processMedia(mp2,'renamed.mp3','decoder-that-does-not-exist')).rejects.toThrow('Chỉ nhận âm thanh MP3 hoặc M4A');
 });
 it('bounds both dimensions of unusually tall pictures',async()=>{
  const bytes=await sharp({create:{width:400,height:4000,channels:3,background:'white'}}).png().toBuffer();
  const result=await processMedia(bytes,'tall.png');expect(result.files.every(f=>f.width!<=1920&&f.height!<=1920)).toBe(true);
  expect(new Set(result.files.map(f=>f.suffix)).size).toBe(result.files.length);
 });
 it('fully decodes real MP3 and seek-requiring M4A audio',async()=>{
  const frame=Buffer.alloc(417);frame.set([255,251,144,0]);const mp3=Buffer.concat(Array(40).fill(frame));
  expect((await processMedia(mp3,'silence.mp3',config.ffmpegPath)).type).toBe('AUDIO');
  const parent=join(config.storageRoot,'.tmp');await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'fixture-')),path=join(directory,'tone.m4a');
  try{
   await promisify(execFile)(config.ffmpegPath,['-v','error','-f','lavfi','-i','sine=frequency=440:duration=5','-c:a','aac','-b:a','192k',path],{windowsHide:true,timeout:15000});
   const bytes=await readFile(path);expect(bytes.length).toBeGreaterThan(32768);
   expect((await processMedia(bytes,'tone.m4a',config.ffmpegPath)).type).toBe('AUDIO');
   const corrupt=Buffer.from(bytes),mdat=corrupt.indexOf(Buffer.from('mdat'));expect(mdat).toBeGreaterThan(0);corrupt.fill(0,mdat+4,mdat+500);
   await expect(processMedia(corrupt,'broken.m4a',config.ffmpegPath)).rejects.toThrow('File âm thanh không decode được');
  }finally{await unlink(path).catch(()=>{});await rmdir(directory);}
 });
});

describe('private staging and retained revision protection',()=>{
 const app=createApp();let f:Awaited<ReturnType<typeof setupTestData>>;
 const admin=(method:'get'|'post'|'delete',path:string)=>request(app)[method](`/api/v1/admin/${path}`).set('Cookie',f.cookie).set('Origin','http://localhost:5173').set('X-CSRF-Token',f.csrf);
 const image=()=>sharp({create:{width:100,height:150,channels:3,background:'green'}}).jpeg().toBuffer();
 beforeEach(async()=>{await resetTestDatabase();f=await setupTestData();});
 it('keeps upload private until publication and requires admin even with preview signature',async()=>{
  const response=await admin('post',`events/${f.event.id}/media`).field('alt','Photo').attach('file',await image(),'image.jpg');expect(response.status).toBe(201);const asset=response.body.data;
  expect(asset.url).toContain('/admin/media/file?');expect((await request(app).get(asset.url)).status).toBe(401);expect((await request(app).get(asset.url).set('Cookie',f.cookie)).status).toBe(200);
  const stored=await prisma.mediaAsset.findUniqueOrThrow({where:{id:asset.id}});await copyPublic(stored.storageKey,'image/webp');expect((await request(app).get('/api/v1/media/'+stored.storageKey)).status).toBe(404);
  const content={...f.content,sections:f.content.sections.map(s=>s.type==='hero'?{...s,data:{...s.data,heroAssetId:asset.id}}:s)};await preparePublishedMedia(f.event.id,content);const media=await mediaUrls(content,false);expect((await request(app).get(media[asset.id].url)).status).toBe(200);
 });
 it('rejects forged uploads and blocks deletion from any retained revision',async()=>{
  expect((await admin('post',`events/${f.event.id}/media`).attach('file',Buffer.from('<svg/>'),'fake.png')).status).toBe(422);
  const id=f.content.sections.find(s=>s.type==='hero')!.data as {heroAssetId:string};
  const blocked=await admin('delete',`media/${id.heroAssetId}`);expect(blocked.status).toBe(409);expect(blocked.body.error.code).toBe('ASSET_IN_USE');
  const uploaded=await admin('post',`events/${f.event.id}/media`).attach('file',await image(),'image.jpg');expect((await admin('delete',`media/${uploaded.body.data.id}`)).status).toBe(200);expect(await prisma.mediaAsset.findUnique({where:{id:uploaded.body.data.id}})).toBeNull();
 });
});

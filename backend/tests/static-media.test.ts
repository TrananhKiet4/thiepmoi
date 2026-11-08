import {expect,it} from 'vitest';
import request from 'supertest';
import {createApp} from '../src/app.js';
import {config} from '../src/config/env.js';
import {demoMediaId} from '../../packages/contracts/src/index.js';
import {demoContent} from '../prisma/data/demo.js';
import {mediaUrls,validateMedia} from '../src/services/media.service.js';
import {randomUUID} from 'node:crypto';

it('has no legacy media download endpoint',async()=>{
 const response=await request(createApp()).get('/api/v1/admin/media/file');
 expect(response.status).toBe(404);
 expect(response.body.error.code).toBe('NOT_FOUND');
});

it('does not sign unlisted private objects under the invitation route',async()=>{
 const previous=config.production;
 config.production=true;
 try{
  const response=await request(createApp()).get('/invitation-assets/music/unlisted.mp3');
  expect(response.status).toBe(404);
  expect(response.headers.location).toBeUndefined();
 }finally{config.production=previous;}
});

it('resolves retained static assets and ignores obsolete gallery IDs',()=>{
 const content=demoContent(demoMediaId);
 const gallery=content.sections.find(section=>section.type==='gallery');
 if(gallery?.type!=='gallery')throw new Error('Missing gallery fixture');
 gallery.data.items=[{assetId:randomUUID(),caption:'Old gallery photo'}];
 expect(()=>validateMedia(content,'publish')).not.toThrow();
 expect(mediaUrls(content)[demoMediaId]).toMatchObject({url:'/invitation-assets/photos/demo.webp',type:'IMAGE'});
 expect(Object.keys(mediaUrls(content))).toEqual([demoMediaId]);
 content.ceremony.mapImageAssetId=randomUUID();
 expect(()=>validateMedia(content,'draft')).toThrow();
 content.ceremony.mapImageAssetId=null;
 content.music.assetId=demoMediaId;
 expect(()=>validateMedia(content,'publish')).toThrow();
});

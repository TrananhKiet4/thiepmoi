import {expect,it} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

it.each([
 {application:'s3',legacy:undefined,production:true,want:'s3'},
 {application:'s3',legacy:'overlay',production:true,want:'s3'},
 {application:undefined,legacy:'local',production:false,want:'local'}
])('loads the application storage setting without inheriting the container builder driver ($application/$legacy)',async({application,legacy,production,want})=>{
 const env={...process.env,NODE_ENV:production?'production':'development',APP_ORIGIN:'https://config.example.test',SESSION_SECRET:'test-only-'.repeat(5),INVITATION_KEY:Buffer.alloc(32).toString('base64'),STORAGE_BUCKET_PRIVATE:'private',STORAGE_BUCKET_PUBLIC:'public',STORAGE_ACCESS_KEY:'test-only',STORAGE_SECRET_KEY:'test-only',PUBLIC_MEDIA_BASE_URL:'https://media.example.test'};
 if(application===undefined)delete env.APP_STORAGE_DRIVER;else env.APP_STORAGE_DRIVER=application;
 if(legacy===undefined)delete env.STORAGE_DRIVER;else env.STORAGE_DRIVER=legacy;
 const result=await promisify(execFile)(process.execPath,['--import','tsx','--input-type=module','-e',"import {config} from './backend/src/config/env.ts'; console.log(JSON.stringify({driver:config.storageDriver}));"],{env,windowsHide:true,timeout:15000}).then(r=>({ok:true,stdout:r.stdout}),()=>({ok:false,stdout:''}));
 expect(result.ok).toBe(true);expect(JSON.parse(result.stdout).driver).toBe(want);
});

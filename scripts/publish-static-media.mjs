import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {extname,join} from 'node:path';
import {GetObjectCommand,HeadObjectCommand,PutObjectCommand,S3Client} from '@aws-sdk/client-s3';
import {parse} from 'dotenv';

const env=parse(readFileSync('.env.production.local','utf8'));
const project=decodeURIComponent(new URL(env.DIRECT_URL).username).match(/^postgres\.([a-z0-9]+)$/)?.[1];
const endpoint=new URL(env.STORAGE_ENDPOINT);
assert(project&&endpoint.protocol==='https:'&&[`${project}.storage.supabase.co`,`${project}.supabase.co`].includes(endpoint.hostname));
const Bucket=env.STORAGE_BUCKET_PRIVATE;
assert(Bucket&&env.STORAGE_ACCESS_KEY&&env.STORAGE_SECRET_KEY);
const client=new S3Client({
 region:env.STORAGE_REGION||'auto',endpoint:endpoint.href,forcePathStyle:true,maxAttempts:2,requestChecksumCalculation:'WHEN_REQUIRED',
 credentials:{accessKeyId:env.STORAGE_ACCESS_KEY,secretAccessKey:env.STORAGE_SECRET_KEY},
});
const root='frontend/public';
const types={'.webp':'image/webp','.mp3':'audio/mpeg','.m4a':'audio/mp4'};
const digest=body=>createHash('sha256').update(body).digest('hex');
function files(directory){
 return readdirSync(join(root,directory),{withFileTypes:true}).flatMap(entry=>{
  const key=directory+'/'+entry.name;
  if(entry.isDirectory())return files(key);
  assert(entry.isFile()&&/^[a-z0-9/-]+\.(webp|mp3|m4a)$/.test(key));
  return key.endsWith('/demo.webp')?[]:[key];
 });
}
async function publish(Key){
 const Body=readFileSync(join(root,Key)),sha256=digest(Body);
 const existing=await client.send(new HeadObjectCommand({Bucket,Key})).catch(error=>{
  if(error.$metadata?.httpStatusCode===404)return null;
  throw error;
 });
 if(existing){
  if(existing.Metadata?.sha256!==sha256){
   assert.equal(existing.ContentLength,Body.length,'Existing file has different content. Choose a new filename.');
   const object=await client.send(new GetObjectCommand({Bucket,Key}));
   assert.equal(digest(await object.Body.transformToByteArray()),sha256,'Existing file has different content. Choose a new filename.');
  }
  return false;
 }
 await client.send(new PutObjectCommand({Bucket,Key,Body,ContentType:types[extname(Key)],CacheControl:'private, max-age=3600',Metadata:{sha256}}));
 const result=await client.send(new HeadObjectCommand({Bucket,Key}));
 assert.equal(result.ContentLength,Body.length);
 assert.equal(result.ContentType,types[extname(Key)]);
 return true;
}
try{
 const keys=files('invitation-assets');
 assert(keys.length>0);
 let uploaded=0;
 for(let index=0;index<keys.length;index+=5){
  uploaded+=(await Promise.all(keys.slice(index,index+5).map(publish))).filter(Boolean).length;
 }
 console.log(JSON.stringify({files:keys.length,uploaded,verified:keys.length}));
}catch(error){
 console.error(JSON.stringify({failed:true,type:error.name,status:error.$metadata?.httpStatusCode,reason:error instanceof assert.AssertionError?error.message.split('\n')[0]:undefined}));
 process.exitCode=1;
}finally{client.destroy();}

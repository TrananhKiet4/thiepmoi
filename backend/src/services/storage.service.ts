import {mkdir,readFile,writeFile,copyFile,unlink} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {Readable} from 'node:stream';
import {S3Client,PutObjectCommand,CopyObjectCommand,DeleteObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {config} from '../config/env.js';

let s3Client:S3Client|undefined;
const s3=()=>s3Client??=new S3Client({region:config.storageRegion,endpoint:config.storageEndpoint||undefined,forcePathStyle:true,credentials:{accessKeyId:config.storageAccessKey,secretAccessKey:config.storageSecretKey}});
export function localPath(key:string,isPublic=false){
 if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/(?:\d+\.webp|audio\.(?:mp3|m4a))$/.test(key))throw new Error('Storage key không hợp lệ');
 const root=resolve(config.storageRoot,isPublic?'public':'private'),path=resolve(root,key);
 if(!path.startsWith(root+sep))throw new Error('Storage key không hợp lệ');return path;
}
export async function putPrivate(key:string,bytes:Buffer,mimeType:string){
 if(config.storageDriver==='s3'){await s3().send(new PutObjectCommand({Bucket:config.storageBucketPrivate,Key:key,Body:bytes,ContentType:mimeType,CacheControl:'private, no-store'}));return;}
 const path=localPath(key);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes,{flag:'wx'});
}
export async function copyPublic(key:string,mimeType:string){
 if(config.storageDriver==='s3'){await s3().send(new CopyObjectCommand({Bucket:config.storageBucketPublic,Key:key,CopySource:encodeURIComponent(config.storageBucketPrivate+'/'+key),ContentType:mimeType,MetadataDirective:'REPLACE',CacheControl:'public, max-age=31536000, immutable'}));return;}
 const destination=localPath(key,true);await mkdir(dirname(destination),{recursive:true});await copyFile(localPath(key),destination);
}
export async function deleteStored(key:string,isPublic=false){
 if(config.storageDriver==='s3'){await s3().send(new DeleteObjectCommand({Bucket:isPublic?config.storageBucketPublic:config.storageBucketPrivate,Key:key}));return;}
 try{await unlink(localPath(key,isPublic));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
}
export async function readStored(key:string,isPublic=false){
 const path=localPath(key,isPublic);if(config.storageDriver==='local')return readFile(path);
 const object=await s3().send(new GetObjectCommand({Bucket:isPublic?config.storageBucketPublic:config.storageBucketPrivate,Key:key}));
 const body=object.Body;if(!(body instanceof Readable))throw new Error('Không đọc được media storage');
 if((object.ContentLength??0)>10*1024*1024){body.destroy();throw new Error('Media storage vượt giới hạn');}
 const chunks:Buffer[]=[];let total=0;
 for await(const chunk of body){total+=chunk.length;if(total>10*1024*1024){body.destroy();throw new Error('Media storage vượt giới hạn');}chunks.push(Buffer.from(chunk));}
 return Buffer.concat(chunks);
}
function signature(key:string,expires:number){return createHmac('sha256',config.sessionSecret).update(`${key}\n${expires}`).digest('hex');}
export function validMediaSignature(key:string,expires:number,value:string){
 if(!Number.isSafeInteger(expires)||expires<Date.now()||expires>Date.now()+5*60*1000||!/^[a-f0-9]{64}$/.test(value))return false;
 return timingSafeEqual(Buffer.from(value,'hex'),Buffer.from(signature(key,expires),'hex'));
}
export async function storageUrl(key:string,admin:boolean){
 if(!admin)return `${(config.publicMediaBaseUrl||'/api/v1/media').replace(/\/$/,'')}/${key}`;
 const expires=Date.now()+300000;return `/api/v1/admin/media/file?key=${encodeURIComponent(key)}&expires=${expires}&signature=${signature(key,expires)}`;
}

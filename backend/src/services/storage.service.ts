import {mkdir,readFile,writeFile,copyFile,rename,unlink,stat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {Readable} from 'node:stream';
import {S3Client,PutObjectCommand,CopyObjectCommand,DeleteObjectCommand,GetObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {config} from '../config/env.js';

let s3Client:S3Client|undefined;
const s3=()=>s3Client??=new S3Client({region:config.storageRegion,endpoint:config.storageEndpoint||undefined,forcePathStyle:true,maxAttempts:2,requestHandler:{connectionTimeout:5000,requestTimeout:15000},requestChecksumCalculation:'WHEN_REQUIRED',credentials:{accessKeyId:config.storageAccessKey,secretAccessKey:config.storageSecretKey}});
export function localPath(key:string,isPublic=false){
 if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/(?:\d+\.webp|audio\.(?:mp3|m4a)|source\.bin|export\.xlsx)$/.test(key))throw new Error('Storage key không hợp lệ');
 const root=resolve(config.storageRoot,isPublic?'public':'private'),path=resolve(root,key);
 if(!path.startsWith(root+sep))throw new Error('Storage key không hợp lệ');return path;
}
export async function putPrivate(key:string,bytes:Buffer,mimeType:string){
 if(config.storageDriver==='s3'){await s3().send(new PutObjectCommand({Bucket:config.storageBucketPrivate,Key:key,Body:bytes,ContentType:mimeType,CacheControl:'private, no-store'}));return;}
 const path=localPath(key);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes,{flag:'wx'});
}
export async function copyPublic(key:string,mimeType:string){
 if(config.storageDriver==='s3'){await s3().send(new CopyObjectCommand({Bucket:config.storageBucketPublic,Key:key,CopySource:encodeURIComponent(config.storageBucketPrivate+'/'+key),ContentType:mimeType,MetadataDirective:'REPLACE',CacheControl:'public, max-age=31536000, immutable'}));return;}
 const destination=localPath(key,true),temporary=`${destination}.${randomUUID()}.tmp`;
 await mkdir(dirname(destination),{recursive:true});
 try{await copyFile(localPath(key),temporary);await rename(temporary,destination);}
 finally{await unlink(temporary).catch(()=>{});}
}
export async function deleteStored(key:string,isPublic=false){
 if(config.storageDriver==='s3'){await s3().send(new DeleteObjectCommand({Bucket:isPublic?config.storageBucketPublic:config.storageBucketPrivate,Key:key}));return;}
 try{await unlink(localPath(key,isPublic));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
}
export async function storedSize(key:string){
 if(config.storageDriver==='local')return (await stat(localPath(key))).size;
 return (await s3().send(new HeadObjectCommand({Bucket:config.storageBucketPrivate,Key:key}))).ContentLength;
}
export async function uploadUrl(key:string,bytes:number){return getSignedUrl(s3(),new PutObjectCommand({Bucket:config.storageBucketPrivate,Key:key,ContentLength:bytes,ContentType:'application/octet-stream'}),{expiresIn:300});}
export async function privateDownloadUrl(key:string,name?:string,expiresIn=60){return getSignedUrl(s3(),new GetObjectCommand({Bucket:config.storageBucketPrivate,Key:key,ResponseCacheControl:'private, no-store',...(name?{ResponseContentDisposition:`attachment; filename="${name}"`}:{})}),{expiresIn});}
export async function readStored(key:string,isPublic=false,maxBytes=10*1024*1024){
 const path=localPath(key,isPublic);if(config.storageDriver==='local'){if((await stat(path)).size>maxBytes)throw new Error('Media storage vượt giới hạn');const bytes=await readFile(path);if(bytes.length>maxBytes)throw new Error('Media storage vượt giới hạn');return bytes;}
 const object=await s3().send(new GetObjectCommand({Bucket:isPublic?config.storageBucketPublic:config.storageBucketPrivate,Key:key}));
 const body=object.Body;if(!(body instanceof Readable))throw new Error('Không đọc được media storage');
 if((object.ContentLength??0)>maxBytes){body.destroy();throw new Error('Media storage vượt giới hạn');}
 const chunks:Buffer[]=[];let total=0;
 for await(const chunk of body){total+=chunk.length;if(total>maxBytes){body.destroy();throw new Error('Media storage vượt giới hạn');}chunks.push(Buffer.from(chunk));}
 return Buffer.concat(chunks);
}
function signature(key:string,expires:number){return createHmac('sha256',config.sessionSecret).update(`${key}\n${expires}`).digest('hex');}
export function validMediaSignature(key:string,expires:number,value:string){
 if(!Number.isSafeInteger(expires)||expires<Date.now()||expires>Date.now()+5*60*1000||!/^[a-f0-9]{64}$/.test(value))return false;
 return timingSafeEqual(Buffer.from(value,'hex'),Buffer.from(signature(key,expires),'hex'));
}
export async function storageUrl(key:string,admin:boolean){
 if(!admin)return `${(config.publicMediaBaseUrl||'/api/v1/media').replace(/\/$/,'')}/${key}`;
 if(config.storageDriver==='s3')return privateDownloadUrl(key,undefined,300);
 const expires=Date.now()+300000;return `/api/v1/admin/media/file?key=${encodeURIComponent(key)}&expires=${expires}&signature=${signature(key,expires)}`;
}

import {mkdir,readFile,writeFile,unlink,stat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {Readable} from 'node:stream';
import {S3Client,PutObjectCommand,DeleteObjectCommand,GetObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {config} from '../config/env.js';

let s3Client:S3Client|undefined;
const s3=()=>s3Client??=new S3Client({region:config.storageRegion,endpoint:config.storageEndpoint||undefined,forcePathStyle:true,maxAttempts:2,requestHandler:{connectionTimeout:5000,requestTimeout:15000},requestChecksumCalculation:'WHEN_REQUIRED',credentials:{accessKeyId:config.storageAccessKey,secretAccessKey:config.storageSecretKey}});
function localPath(key:string){
 if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/(?:source\.bin|export\.xlsx)$/.test(key))throw new Error('Storage key không hợp lệ');
 const root=resolve(config.storageRoot,'private'),path=resolve(root,key);
 if(!path.startsWith(root+sep))throw new Error('Storage key không hợp lệ');return path;
}
export async function putPrivate(key:string,bytes:Buffer,mimeType:string){
 if(config.storageDriver==='s3'){await s3().send(new PutObjectCommand({Bucket:config.storageBucketPrivate,Key:key,Body:bytes,ContentType:mimeType,CacheControl:'private, no-store'}));return;}
 const path=localPath(key);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes,{flag:'wx'});
}
export async function deleteStored(key:string){
 if(config.storageDriver==='s3'){await s3().send(new DeleteObjectCommand({Bucket:config.storageBucketPrivate,Key:key}));return;}
 try{await unlink(localPath(key));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
}
export async function storedSize(key:string){
 if(config.storageDriver==='local')return (await stat(localPath(key))).size;
 return (await s3().send(new HeadObjectCommand({Bucket:config.storageBucketPrivate,Key:key}))).ContentLength;
}
export async function uploadUrl(key:string,bytes:number){return getSignedUrl(s3(),new PutObjectCommand({Bucket:config.storageBucketPrivate,Key:key,ContentLength:bytes,ContentType:'application/octet-stream'}),{expiresIn:300});}
export async function privateDownloadUrl(key:string,name?:string){
 const download=name?{ResponseCacheControl:'private, no-store',ResponseContentDisposition:`attachment; filename="${name}"`}:{};
 return getSignedUrl(s3(),new GetObjectCommand({Bucket:config.storageBucketPrivate,Key:key,...download}),{expiresIn:name?60:3600});
}
export async function readStored(key:string,maxBytes:number){
 const path=localPath(key);if(config.storageDriver==='local'){if((await stat(path)).size>maxBytes)throw new Error('File vượt giới hạn');const bytes=await readFile(path);if(bytes.length>maxBytes)throw new Error('File vượt giới hạn');return bytes;}
 const object=await s3().send(new GetObjectCommand({Bucket:config.storageBucketPrivate,Key:key}));
 const body=object.Body;if(!(body instanceof Readable))throw new Error('Không đọc được file lưu trữ');
 if((object.ContentLength??0)>maxBytes){body.destroy();throw new Error('File vượt giới hạn');}
 const chunks:Buffer[]=[];let total=0;
 for await(const chunk of body){total+=chunk.length;if(total>maxBytes){body.destroy();throw new Error('File vượt giới hạn');}chunks.push(Buffer.from(chunk));}
 return Buffer.concat(chunks);
}

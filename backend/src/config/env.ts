import {config as loadEnv} from 'dotenv';
import {resolve} from 'node:path';

loadEnv({path:resolve(process.cwd(),process.env.NODE_ENV==='test'?'.env.test':'.env'),quiet:true});
function required(name:string,min=1){const value=process.env[name];if(!value||value.length<min||value.includes('REPLACE_WITH'))throw new Error(`Missing/invalid ${name}; configure server environment`);return value;}
const origin=new URL(required('APP_ORIGIN'));
if(!['http:','https:'].includes(origin.protocol)||origin.origin!==required('APP_ORIGIN'))throw new Error('APP_ORIGIN must be an origin without path');
const production=process.env.NODE_ENV==='production';
if(production&&origin.protocol!=='https:')throw new Error('Production APP_ORIGIN requires HTTPS');
const invitationKey=required('INVITATION_KEY');if(Buffer.from(invitationKey,'base64').length!==32)throw new Error('INVITATION_KEY must be base64 of 32 bytes');
const storageDriver=process.env.STORAGE_DRIVER??'local';if(!['local','s3'].includes(storageDriver))throw new Error('Invalid STORAGE_DRIVER');
if(production&&storageDriver!=='s3')throw new Error('Production requires S3 storage');
const oldKeys=JSON.parse(process.env.INVITATION_OLD_KEYS??'{}') as Record<string,string>;
for(const value of Object.values(oldKeys))if(Buffer.from(value,'base64').length!==32)throw new Error('Invalid old invitation key');
export const config={
 production,port:Number(process.env.PORT??4000),appOrigin:origin.origin,databaseUrl:required('DATABASE_URL'),sessionSecret:required('SESSION_SECRET',32),
 invitationKey,invitationKeyVersion:process.env.INVITATION_KEY_VERSION??'1',invitationOldKeys:oldKeys,
 storageDriver:storageDriver as 'local'|'s3',storageRoot:resolve(process.env.STORAGE_LOCAL_PATH??'.data/media'),
 storageEndpoint:process.env.STORAGE_ENDPOINT??'',storageRegion:process.env.STORAGE_REGION??'auto',
 storageBucketPrivate:process.env.STORAGE_BUCKET_PRIVATE??'',storageBucketPublic:process.env.STORAGE_BUCKET_PUBLIC??'',
 storageAccessKey:process.env.STORAGE_ACCESS_KEY??'',storageSecretKey:process.env.STORAGE_SECRET_KEY??'',
 publicMediaBaseUrl:process.env.PUBLIC_MEDIA_BASE_URL??'',ffmpegPath:process.env.FFMPEG_PATH??'ffmpeg',
 corsOrigins:(process.env.CORS_ORIGINS??origin.origin).split(',').map(s=>s.trim()),
 trustProxy:process.env.TRUST_PROXY==='true'?1:false as false|number
};
if(storageDriver==='s3')for(const name of ['storageBucketPrivate','storageBucketPublic','storageAccessKey','storageSecretKey','publicMediaBaseUrl'] as const)if(!config[name])throw new Error(`Missing ${name} for S3`);
if(config.publicMediaBaseUrl){const url=new URL(config.publicMediaBaseUrl);if(url.protocol!=='https:')throw new Error('Public media base must use HTTPS');}

import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,randomInt} from 'node:crypto';
import {config} from '../config/env.js';

export const hashToken=(value:string)=>createHash('sha256').update(value).digest('hex');
function key(version:string){const value=version===config.invitationKeyVersion?config.invitationKey:config.invitationOldKeys[version];if(!value)throw new Error('Invitation encryption key version unavailable');return Buffer.from(value,'base64');}
export function encryptInvitationToken(invitationId:string,token:string,keyVersion=config.invitationKeyVersion){
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(keyVersion),nonce);
 cipher.setAAD(Buffer.from(invitationId));
 const encrypted=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return {tokenCiphertext:Buffer.concat([nonce,cipher.getAuthTag(),encrypted]).toString('base64'),keyVersion};
}
export function createInvitationToken(invitationId:string){
 const token=randomBytes(32).toString('base64url');return {token,tokenHash:hashToken(token),...encryptInvitationToken(invitationId,token)};
}
export function decryptInvitationToken(invitationId:string,ciphertext:string,keyVersion:string){
 const data=Buffer.from(ciphertext,'base64');const decipher=createDecipheriv('aes-256-gcm',key(keyVersion),data.subarray(0,12));
 decipher.setAAD(Buffer.from(invitationId));decipher.setAuthTag(data.subarray(12,28));
 return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8');
}
export function createInvitationLinkCode(){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';return Array.from({length:5},()=>alphabet[randomInt(alphabet.length)]).join('');}
export const parseShortCredential=(value:string)=>/^([A-Za-z0-9]{5})\.([a-z0-9-]{1,200})$/.exec(value);
export const invitationLinkHash=(code:string,slug:string,version=config.invitationKeyVersion)=>createHmac('sha256',key(version)).update('invitation-link:v1\0'+slug+'\0'+code).digest('hex');
export const invitationLinkHashes=(code:string,slug:string)=>[...new Set([config.invitationKeyVersion,...Object.keys(config.invitationOldKeys)])].map(version=>invitationLinkHash(code,slug,version));

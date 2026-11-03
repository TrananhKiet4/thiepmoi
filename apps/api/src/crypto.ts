import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {config} from './config.js';
export const hashToken=(value:string)=>createHash('sha256').update(value).digest('hex');
export function createInvitationToken(invitationId:string){
 const token=randomBytes(32).toString('base64url'),nonce=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',Buffer.from(config.invitationKey,'base64'),nonce);
 cipher.setAAD(Buffer.from(invitationId));
 const encrypted=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return {token,tokenHash:hashToken(token),tokenCiphertext:Buffer.concat([nonce,cipher.getAuthTag(),encrypted]).toString('base64'),keyVersion:config.invitationKeyVersion};
}
export function decryptInvitationToken(invitationId:string,ciphertext:string,keyVersion:string){
 const key=keyVersion===config.invitationKeyVersion?config.invitationKey:config.invitationOldKeys[keyVersion];
 if(!key)throw new Error('Invitation encryption key version unavailable');
 const data=Buffer.from(ciphertext,'base64');const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'base64'),data.subarray(0,12));
 decipher.setAAD(Buffer.from(invitationId));decipher.setAuthTag(data.subarray(12,28));
 return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8');
}

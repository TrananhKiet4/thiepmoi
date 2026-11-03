import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createInvitationToken, decryptInvitationToken, hashToken } from '../src/crypto.js';
import { canWrite, personalize, publicWish, createCalendar } from '../src/domain.js';
describe('security and invitation rules',()=>{
 it('binds an encrypted random invitation token to its invitation id',()=>{
  const id=randomUUID(); const t=createInvitationToken(id);
  expect(t.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(t.tokenHash).toBe(hashToken(t.token));
  expect(decryptInvitationToken(id,t.tokenCiphertext,t.keyVersion)).toBe(t.token);
  expect(()=>decryptInvitationToken(randomUUID(),t.tokenCiphertext,t.keyVersion)).toThrow();
  expect(createInvitationToken(id).token).not.toBe(t.token);
 });
 it('closes writes at the exact server deadline',()=>{
  expect(canWrite(true,'2026-12-01T03:00:00Z',new Date('2026-12-01T02:59:59Z'))).toBe(true);
  expect(canWrite(true,'2026-12-01T03:00:00Z',new Date('2026-12-01T03:00:00Z'))).toBe(false);
  expect(canWrite(false,null,new Date())).toBe(false);
 });
 it('only substitutes the defined variables as plain text',()=>{
  expect(personalize('Mời {{guestName}}, {{hostName}} {{salutation}} {{2+2}}',{guestName:'An',hostName:'Bình',salutation:'bạn'})).toBe('Mời An, Bình bạn {{2+2}}');
 });
 it('requires consent, approval and active invitation for a public wish',()=>{
  const w={consentPublic:true,moderationStatus:'APPROVED',deletedAt:null,invitation:{revokedAt:null,guest:{archivedAt:null}}};
  expect(publicWish(w)).toBe(true);
  expect(publicWish({...w,consentPublic:false})).toBe(false);
  expect(publicWish({...w,invitation:{...w.invitation,revokedAt:new Date()}})).toBe(false);
 });
 it('escapes calendar text and preserves stable UTC timing',()=>{
  const c=createCalendar('event-1',{host:{fullName:'Người tốt nghiệp'},ceremony:{startAt:'2026-12-01T03:00:00Z',endAt:'2026-12-01T04:00:00Z',venueName:'Hội trường',address:'A, B; C\nD'}} as any);
  expect(c).toContain('DTSTART:20261201T030000Z');
  expect(c).toContain('DTEND:20261201T040000Z');
  expect(c).toContain('UID:event-1@graduation-invitation');
  expect(c).toContain('A\\, B\\; C\\nD');
 });
});

import {expect,it} from 'vitest';
import {contentSchema,publicationErrors,guestSchema} from './index.js';
import {demoContent} from '../../../backend/prisma/data/demo.js';
import * as contracts from './index.js';
import {randomUUID} from 'node:crypto';
it('allows clearing required dates in a draft but rejects publication until completed',()=>{
 const draft=demoContent(null);draft.ceremony.startAt='';draft.ceremony.endAt='';draft.rsvpDeadline='';
 const result=contentSchema.safeParse(draft);expect(result.success).toBe(true);
 const errors=publicationErrors(result.success?result.data:draft);
 expect(errors['ceremony.startAt']).toBeTruthy();expect(errors['ceremony.endAt']).toBeTruthy();expect(errors.rsvpDeadline).toBeTruthy();
});
it('normalizes equivalent Vietnamese group labels to the same template key',()=>{
 expect(guestSchema.parse({guestCode:'a',fullName:'An',groupKey:'  Bạn Bè 2026  '}).groupKey).toBe('ban_be_2026');
});
it.each(['https://maps.app.goo.gl/School123','https://www.google.com/maps/place/School','https://maps.google.com/?q=School','https://goo.gl/maps/School123','https://www.google.com.vn/maps/search/?api=1&query=School'])('accepts a real Google Maps link without coordinates: %s',googleMapsUrl=>{
 const value={startAt:'',endAt:'',venueName:'School',address:'Address',googleMapsUrl,mapImageAssetId:null};
 const result=contracts.locationSchema.safeParse(value);expect(result.success).toBe(true);if(result.success)expect(result.data.googleMapsUrl).toBe(googleMapsUrl);
});
it.each(['javascript:alert(1)','http://maps.app.goo.gl/School','https://www.google.com.evil.test/maps','https://maps.app.goo.gl@evil.test/School','https://user@www.google.com/maps','https://www.google.com/url?q=https://evil.test','https://www.google.com:444/maps','https://maps.google.com/url?q=https://evil.test','https://maps.google.com/accounts'])('rejects a non-Maps or unsafe destination: %s',googleMapsUrl=>{
 expect(contracts.locationSchema.safeParse({...demoContent(null).ceremony,googleMapsUrl}).success).toBe(false);
});
it('reads old coordinate JSON without retaining coordinate controls in the new content',()=>{
 const old:any=demoContent(null);delete old.ceremony.googleMapsUrl;delete old.ceremony.mapImageAssetId;old.ceremony.latitude=10.7;old.ceremony.longitude=106.7;
 const result=contentSchema.parse(old);expect(result.ceremony.googleMapsUrl).toBe('');expect(result.ceremony.mapImageAssetId).toBeNull();expect(result.ceremony).not.toHaveProperty('latitude');expect(result.ceremony).not.toHaveProperty('longitude');
});
it('prepares a clean simplified draft without mutating the stored legacy revision',()=>{
 expect(typeof (contracts as any).editableContent).toBe('function');
 const old:any=demoContent(null),snapshot=structuredClone(old);old.groupMessages={ban_be:'Old group message'};
 const next=(contracts as any).editableContent(old);
 expect(next.meetup).toBeNull();expect(next.rsvpDeadline).toBeNull();expect(next.wishDeadline).toBeNull();expect(next.groupMessages).toEqual({});
 expect(next.sections.find((s:any)=>s.type==='map').data.locationSource).toBe('CEREMONY');expect(old.rsvpDeadline).toBe(snapshot.rsvpDeadline);expect(old.groupMessages).toEqual({ban_be:'Old group message'});
});
it('allows publication without reception deadlines while retaining mandatory ceremony dates',()=>{
 const value:any=demoContent(randomUUID());value.meetup=null;value.rsvpDeadline=null;value.wishDeadline=null;value.sections.find((s:any)=>s.type==='map').data.locationSource='CEREMONY';
 const result=contentSchema.safeParse(value);expect(result.success).toBe(true);if(result.success)expect(publicationErrors(result.data)).toEqual({});
});
it('includes the campus image in revision-owned media references without duplicates',()=>{
 const image=randomUUID(),value:any=demoContent(image);value.ceremony.mapImageAssetId=image;
 expect(contracts.assetIds(value)).toEqual([image]);value.ceremony.mapImageAssetId=randomUUID();expect(contracts.assetIds(value)).toContain(value.ceremony.mapImageAssetId);
});
it('uses the supplied link or an encoded bounded address search for legacy locations',()=>{
 expect(typeof (contracts as any).googleMapsLink).toBe('function');const link=(contracts as any).googleMapsLink;
 expect(link({googleMapsUrl:'https://maps.app.goo.gl/School123',address:'Other',venueName:'School'})).toBe('https://maps.app.goo.gl/School123');
 const url=new URL(link({googleMapsUrl:'',address:'180 Cao Lỗ, TP Hồ Chí Minh',venueName:'School'}));expect(url.origin).toBe('https://www.google.com');expect(url.searchParams.get('query')).toBe('180 Cao Lỗ, TP Hồ Chí Minh');expect(url.searchParams.get('api')).toBe('1');
 expect(link({googleMapsUrl:'',address:'🏫'.repeat(500),venueName:''}).length).toBeLessThanOrEqual(2048);
});

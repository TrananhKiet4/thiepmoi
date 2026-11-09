import type {Content} from '../../../packages/contracts/src/index.js';

export function canWrite(enabled:boolean,deadline:string|Date|null,now=new Date()){return enabled&&(!deadline||now.getTime()<new Date(deadline).getTime());}
export function personalize(template:string,vars:Record<string,string>){return template.replace(/\{\{([A-Za-z]+)\}\}/g,(match,key:string)=>Object.hasOwn(vars,key)?vars[key]:match);}
export function publicWish(w:any){return !!(w.consentPublic&&w.moderationStatus==='APPROVED'&&!w.deletedAt&&!w.invitation.revokedAt&&!w.invitation.guest.archivedAt&&!w.invitation.familyParent?.revokedAt&&!w.invitation.familyParent?.guest.archivedAt);}
const icsEscape=(v:string)=>v.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const icsDate=(v:string)=>new Date(v).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
export function createCalendar(eventId:string,content:Content){
 const l=content.meetup??content.ceremony;
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Graduation Invitation//VI','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${eventId}@graduation-invitation`,`DTSTAMP:${icsDate(new Date().toISOString())}`,`DTSTART:${icsDate(l.startAt)}`,`DTEND:${icsDate(l.endAt)}`,`SUMMARY:${icsEscape('Tốt nghiệp — '+content.host.fullName)}`,`LOCATION:${icsEscape(l.venueName+' — '+l.address)}`,'END:VEVENT','END:VCALENDAR'];
 // Fold by UTF-8 bytes so Vietnamese text remains valid in calendar clients.
 return lines.map(line=>{let out='',current='';for(const ch of line){if(Buffer.byteLength(current+ch)>73){out+=current+'\r\n';current=' ';}current+=ch;}return out+current;}).join('\r\n')+'\r\n';
}

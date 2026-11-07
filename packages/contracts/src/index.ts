import { z } from 'zod';
const text=(max:number)=>z.string().trim().max(max);
const id=z.string().uuid();
const optionalId=id.nullable().optional();
const date=z.string().datetime({offset:true});
const draftDate=z.union([date,z.literal('')]);
export const normalizeGroupKey=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').replace(/[đĐ]/g,'d').toLowerCase().trim().replace(/[^a-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'');
function validGoogleMapsUrl(value:string){
 if(!value)return true;
 try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port)return false;
  if(url.hostname==='maps.app.goo.gl')return url.pathname!=='/';
  if(url.hostname==='maps.google.com')return url.pathname==='/'||/^\/maps(?:\/|$)/.test(url.pathname);
  if(url.hostname==='goo.gl')return url.pathname.startsWith('/maps/');
  return ['google.com','www.google.com','google.com.vn','www.google.com.vn'].includes(url.hostname)&&/^\/maps(?:\/|$)/.test(url.pathname);
 }catch{return false;}
}
export const locationSchema=z.object({startAt:draftDate,endAt:draftDate,venueName:text(200),address:text(500),googleMapsUrl:text(2048).refine(validGoogleMapsUrl,'Nhập link Google Maps HTTPS hợp lệ').default(''),mapImageAssetId:id.nullable().default(null),entranceNote:text(1000).default('')});
const sectionBase={id:z.string().min(1).max(80),enabled:z.boolean(),order:z.number().int().min(0).max(100)};
export const sectionSchema=z.discriminatedUnion('type',[
 z.object({...sectionBase,type:z.literal('opening'),data:z.object({title:text(200),messageTemplate:text(1000),coverAssetId:optionalId})}),
 z.object({...sectionBase,type:z.literal('hero'),data:z.object({title:text(200),subtitle:text(500).default(''),heroAssetId:optionalId})}),
 z.object({...sectionBase,type:z.literal('story'),data:z.object({items:z.array(z.object({id:text(80),label:text(100),title:text(200),body:text(3000),imageAssetId:optionalId})).max(12)})}),
 z.object({...sectionBase,type:z.literal('gallery'),data:z.object({items:z.array(z.object({assetId:id,caption:text(500)})).max(40)})}),
 z.object({...sectionBase,type:z.literal('invitation'),data:z.object({title:text(200),message:text(2000)})}),
 z.object({...sectionBase,type:z.literal('map'),data:z.object({title:text(200),locationSource:z.enum(['CEREMONY','MEETUP']),instructions:text(1000)})}),
 z.object({...sectionBase,type:z.literal('response'),data:z.object({title:text(200),rsvpIntro:text(1000),wishIntro:text(1000)})}),
 z.object({...sectionBase,type:z.literal('closing'),data:z.object({message:text(2000),attendingMessage:text(1000).default(''),declinedMessage:text(1000).default('')})})
]);
export const contentSchema=z.object({
 schemaVersion:z.literal(1),host:z.object({fullName:text(120),university:text(200),major:text(200),cohort:text(80).default('')}),
 ceremony:locationSchema,meetup:locationSchema.nullable().default(null),rsvpDeadline:draftDate.nullable().default(null),wishDeadline:date.nullable().default(null),
 timezone:z.literal('Asia/Ho_Chi_Minh').default('Asia/Ho_Chi_Minh'),
 theme:z.object({palette:z.enum(['cream','sage','rose','blue']).default('cream'),font:z.enum(['serif','sans','lora','be-vietnam-pro']).default('serif')}),
 music:z.object({enabled:z.boolean(),assetId:optionalId,volume:z.number().min(0).max(1).default(.25),loop:z.boolean().default(true)}),
 groupMessages:z.record(z.string().max(60),text(1000)).refine(v=>Object.keys(v).length<=100,'Tối đa 100 mẫu nhóm').default({}),
 sections:z.array(sectionSchema).min(1).max(16)
}).strict().superRefine((c,ctx)=>{
 const types=c.sections.map(s=>s.type),ids=c.sections.map(s=>s.id);
 if(new Set(ids).size!==ids.length||new Set(types).size!==types.length)ctx.addIssue({code:'custom',path:['sections'],message:'Mỗi chặng và ID chỉ được xuất hiện một lần'});
 for(const required of ['opening','hero','invitation','map','response'])if(!c.sections.some(s=>s.type===required&&s.enabled))ctx.addIssue({code:'custom',path:['sections'],message:`Không thể bỏ chặng ${required}`});
});
export type Content=z.infer<typeof contentSchema>;
export function editableContent(value:unknown):Content{
 const content=contentSchema.parse(value);
 return {...content,meetup:null,rsvpDeadline:null,wishDeadline:null,groupMessages:{},sections:content.sections.map(section=>section.type==='map'?{...section,data:{...section.data,locationSource:'CEREMONY'}}:section)};
}
export function googleMapsLink(location:Pick<Content['ceremony'],'googleMapsUrl'|'address'|'venueName'>):string{
 if(location.googleMapsUrl)return location.googleMapsUrl;
 const query=Array.from(location.address||location.venueName).slice(0,150).join('');
 return 'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query});
}
export type Section=Content['sections'][number];
export const guestSchema=z.object({guestCode:z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/).transform(s=>s.toUpperCase()),fullName:text(120).min(1),displayName:text(80).default(''),groupKey:text(60).transform(normalizeGroupKey).default(''),salutation:text(40).default(''),email:z.union([z.string().trim().email().max(254),z.literal('')]).default(''),phone:text(30).default(''),personalMessage:text(1000).default('')}).strict();
export const rsvpSchema=z.object({status:z.enum(['ATTENDING','DECLINED']),note:text(500).default(''),expectedVersion:z.number().int().min(0)}).strict();
export const wishSchema=z.object({body:text(1000).min(1),consentPublic:z.boolean(),consentAttendancePublic:z.boolean().optional(),expectedVersion:z.number().int().min(0)}).strict();
export const versionSchema=z.object({expectedVersion:z.number().int().min(1)}).strict();
export function assetIds(content:Content):string[]{
 const ids=new Set<string>();if(content.music.assetId)ids.add(content.music.assetId);
 for(const location of [content.ceremony,content.meetup])if(location?.mapImageAssetId)ids.add(location.mapImageAssetId);
 for(const s of content.sections){const d=s.data as any;for(const key of ['coverAssetId','heroAssetId'])if(d[key])ids.add(d[key]);for(const i of d.items??[])if(i.assetId||i.imageAssetId)ids.add(i.assetId??i.imageAssetId);}
 return [...ids];
}
export function publicationErrors(content:Content):Record<string,string>{
 const errors:Record<string,string>={};
 for(const [name,location] of [['ceremony',content.ceremony],['meetup',content.meetup]] as const)if(location)for(const key of ['startAt','endAt'] as const)if(!date.safeParse(location[key]).success)errors[`${name}.${key}`]='Vui lòng điền ngày giờ hợp lệ';
 if(content.rsvpDeadline!==null&&!date.safeParse(content.rsvpDeadline).success)errors.rsvpDeadline='Vui lòng điền hạn phản hồi hợp lệ';
 for(const k of ['fullName','university','major'] as const)if(!content.host[k])errors[`host.${k}`]='Vui lòng điền thông tin';
 for(const [name,loc] of [['ceremony',content.ceremony],['meetup',content.meetup]] as const){if(!loc)continue;if(!loc.venueName||!loc.address)errors[name]='Thiếu tên hoặc địa chỉ địa điểm';if(Date.parse(loc.endAt)<=Date.parse(loc.startAt))errors[`${name}.endAt`]='Giờ kết thúc phải sau giờ bắt đầu';}
 if(content.rsvpDeadline!==null&&Date.parse(content.rsvpDeadline)>Date.parse((content.meetup??content.ceremony).startAt))errors.rsvpDeadline='Hạn phản hồi không được sau giờ gặp/lễ';
 const hero=content.sections.find(s=>s.type==='hero');if(!hero||!(hero.data as any).heroAssetId)errors['sections.hero.heroAssetId']='Vui lòng chọn ảnh chính';
 if(content.music.enabled&&!content.music.assetId)errors['music.assetId']='Vui lòng chọn file nhạc';
 if(content.sections.some(s=>s.type==='map'&&s.data.locationSource==='MEETUP')&&!content.meetup)errors.meetup='Bản đồ giờ gặp cần thông tin giờ gặp';
 return errors;
}
export type MediaView={id:string;url:string;alt:string;type:string;width?:number|null;height?:number|null;srcSet?:string};
export {demoMediaId,staticMedia} from './static-media.js';
export {companionPhotos} from './companion-photos.js';
export const companionPhotoPath=(file:string)=>'/invitation-assets/photos/companions/'+file;
export type PublicWish={id:string;displayName:string;body:string;approvedAt:string;attendanceStatus:'ATTENDING'|'DECLINED'|null;isPinned:boolean};
export type InvitationView={content:Content;media:Record<string,MediaView>;guest:{displayName:string;fullName?:string;salutation?:string};personalMessage:string;rsvp:any;wish:any;canRsvp:boolean;canCreateOrEditWish:boolean;canWithdrawWish:boolean;eventId:string;wallEnabled?:boolean;preview?:boolean;previewWishes?:PublicWish[]};

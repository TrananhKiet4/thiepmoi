import {Worker} from 'node:worker_threads';
import {guestSchema} from '../../../packages/contracts/src/index.js';

export const columns={guest_code:'guestCode',full_name:'fullName',display_name:'displayName',group:'groupKey',salutation:'salutation',personal_message:'personalMessage',email:'email',phone:'phone'} as const;
export type Mapping=Partial<Record<keyof typeof columns,string>>;
export type RowError={row:number;column:string;message:string};
export type ParsedRow={row:number;values:Record<string,string>;errors?:Omit<RowError,'row'>[]};
export type NormalizedRow={row:number;values:Record<string,string>;expectedGuestVersion?:number;expectedInvitationVersion?:number;guestId?:string;invitationId?:string;action?:string};
export function validateMapping(mapping:unknown):asserts mapping is Mapping {
 if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))throw new Error('Mapping không hợp lệ');
 const entries=Object.entries(mapping);
 if(!entries.some(([k])=>k==='guest_code')||!entries.some(([k])=>k==='full_name')||entries.some(([k,v])=>!(k in columns)||typeof v!=='string'||!v)||new Set(entries.map(([,v])=>v)).size!==entries.length)throw new Error('Mapping cần guest_code và full_name, mỗi cột chỉ dùng một lần');
}
export async function parseWorkbook(bytes:Buffer,sheet?:string,mapping?:Mapping):Promise<{sheets:{name:string;headers:string[]}[];rows?:ParsedRow[]}> {
 if(!bytes.length||bytes.length>5*1024*1024)throw new Error('File XLSX tối đa 5 MB');
 if(sheet)validateMapping(mapping);
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL("./excel-worker.mjs",import.meta.url),{workerData:{bytes,sheet,mapping},resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32,stackSizeMb:4}});
  const timer=setTimeout(()=>{void worker.terminate();reject(new Error('Đọc XLSX quá thời gian 15 giây'));},15000);
  worker.once('message',message=>{clearTimeout(timer);void worker.terminate();message.error?reject(new Error(message.error)):resolve(message);});
  worker.once('error',error=>{clearTimeout(timer);reject(error);});
  worker.once('exit',code=>{clearTimeout(timer);if(code)reject(new Error('Parser XLSX vượt giới hạn tài nguyên'));});
 });
}
export function normalizeRows(parsed:ParsedRow[],mapping:Mapping) {
 const rows:NormalizedRow[]=[],errors:RowError[]=[],warnings:RowError[]=[];const codes=new Set<string>(),names=new Map<string,string>();
 for(const item of parsed){
  for(const error of item.errors??[])errors.push({row:item.row,...error});
  const input:Record<string,string>={};for(const key of Object.keys(mapping) as (keyof Mapping)[])input[columns[key]]=item.values[key]??'';
  const code=(input.guestCode??'').toUpperCase();if(code&&codes.has(code))errors.push({row:item.row,column:'guest_code',message:'Mã khách bị trùng trong file'});if(code)codes.add(code);
  const checked=guestSchema.safeParse(input);
  if(!checked.success){for(const issue of checked.error.issues)errors.push({row:item.row,column:Object.keys(columns).find(k=>columns[k as keyof Mapping]===issue.path[0])??String(issue.path[0]),message:issue.message});continue;}
  const value=checked.data;
  const name=value.fullName.toLocaleLowerCase('vi');if(names.has(name)&&names.get(name)!==value.guestCode)warnings.push({row:item.row,column:'full_name',message:'Trùng tên nhưng khác mã khách'});names.set(name,value.guestCode);
  rows.push({row:item.row,values:Object.fromEntries(Object.keys(mapping).map(k=>{const field=columns[k as keyof Mapping];return [field,value[field]];}))});
 }
 return {rows,errors,warnings};
}

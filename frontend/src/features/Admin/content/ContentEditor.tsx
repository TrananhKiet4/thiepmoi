import {useEffect,useMemo,useState} from 'react';
import {ArrowDown,ArrowUp,Check,Eye,Plus,Save,Trash2} from 'lucide-react';
import type {Content,InvitationView} from '@invite/contracts';
import {contentSchema,editableContent,staticMedia} from '@invite/contracts';
import {request} from '../../../lib/api';
import {useAdmin} from '../../../contexts/AdminContext';
import {Action,Badge,ErrorBox,Field,Modal,PageHead} from '../../../components/ui/index';
import {Invitation} from '../../Guest/invitation/Invitation';
import {MapImageField} from './MapImageField';

const images=Object.values(staticMedia).filter(asset=>asset.type==='IMAGE');
const audio=Object.values(staticMedia).filter(asset=>asset.type==='AUDIO');

export const labels:Record<string,string>={phone:'Số điện thoại công khai',facebookUrl:'Link Facebook công khai',notes:'Lưu ý khi đến dự lễ (mỗi dòng một mục)',fullName:'Họ và tên',university:'Trường đại học',major:'Ngành học',cohort:'Khóa học',startAt:'Thời gian bắt đầu',endAt:'Thời gian kết thúc',venueName:'Tên địa điểm',address:'Địa chỉ',googleMapsUrl:'Link Google Maps',entranceNote:'Hướng dẫn cổng vào',rsvpDeadline:'Hạn xác nhận tham dự',wishDeadline:'Hạn nhận lời chúc',palette:'Bảng màu',font:'Kiểu chữ',enabled:'Bật',assetId:'Bản nhạc',volume:'Âm lượng (0–1)',loop:'Phát lặp lại',title:'Tiêu đề',subtitle:'Dòng giới thiệu',messageTemplate:'Mẫu lời mở đầu',coverAssetId:'Ảnh bìa',heroAssetId:'Ảnh chính',id:'Mã mục',label:'Nhãn / mốc thời gian',body:'Nội dung',imageAssetId:'Ảnh minh họa',message:'Lời nhắn',locationSource:'Địa điểm hiển thị trên bản đồ',wishIntro:'Lời dẫn gửi lời chúc',attendingMessage:'Lời kết cho khách tham dự',declinedMessage:'Lời kết cho khách không tham dự'};
export const sectionNames:Record<string,string>={opening:'Mở thiệp',hero:'Khoảnh khắc tốt nghiệp',story:'Câu chuyện',gallery:'Người đồng hành',invitation:'Lời mời chính thức',map:'Bản đồ',response:'Phản hồi & lời chúc',closing:'Lời kết'};
export const optionalSections=['story','gallery','closing'];
export function defaults(type:string):any{return type==='story'?{items:[]}:type==='gallery'?{items:[]}:{message:'Cảm ơn bạn đã là một phần trong chặng đường này.',attendingMessage:'Hẹn gặp bạn!',declinedMessage:'Mong gặp bạn ở một dịp khác.'};}
export function localDate(v:string){return v?new Date(new Date(v).getTime()+7*3600000).toISOString().slice(0,16):'';}
export function EditObject({value,onChange,path=''}:{value:any;onChange:(v:any)=>void;path?:string}){return <div className="form-grid">{Object.entries(value).map(([key,v])=>{if(['items','locationSource','latitude','longitude','rsvpIntro','instructions'].includes(key))return null;const label=labels[key]||key,change=(next:any)=>onChange({...value,[key]:next});if(key==='googleMapsUrl')return <Field label={label} key={key}><input type="url" value={String(v||'')} maxLength={2048} placeholder="https://maps.app.goo.gl/…" onChange={e=>change(e.target.value)}/></Field>;if(typeof v==='boolean')return <label className="check-label" key={key}><input type="checkbox" checked={v} onChange={e=>change(e.target.checked)}/>{label}</label>;if(key.endsWith('AssetId')||key==='assetId')return <Field label={label} key={key}><select value={v as string||''} onChange={e=>change(e.target.value||null)}><option value="">Chưa chọn</option>{(path==='music'?audio:images).map(asset=><option key={asset.id} value={asset.id}>{asset.originalName}</option>)}</select></Field>;if(['palette','font','locationSource'].includes(key)){const options=key==='palette'?[['cream','Kem & vàng'],['sage','Xanh thảo mộc'],['rose','Hồng trầm'],['blue','Xanh dương']]:key==='font'?[['serif','Chữ có chân'],['sans','Chữ không chân'],['lora','Lora · Có chân'],['be-vietnam-pro','Be Vietnam Pro · Không chân']]:[['CEREMONY','Địa điểm lễ'],['MEETUP','Địa điểm gặp / chụp ảnh']];return <Field label={label} key={key}><select value={String(v)} onChange={e=>change(e.target.value)}>{options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>;}if(key.endsWith('At')||key.endsWith('Deadline'))return <Field key={key} label={label+' (giờ Việt Nam)'}><input type="datetime-local" value={localDate(v as string||'')} onChange={e=>change(e.target.value?new Date(e.target.value+':00+07:00').toISOString():key==='wishDeadline'?null:'')}/></Field>;if(typeof v==='number')return <Field key={key} label={label} type="number" step="any" value={v} onChange={(e:any)=>change(Number(e.target.value))}/>;if(v&&typeof v==='object')return <fieldset className="nested-field" key={key}><legend>{label}</legend><EditObject value={v} onChange={change}/></fieldset>;return <Field key={key} label={label}>{['body','message','messageTemplate','notes','wishIntro','attendingMessage','declinedMessage','entranceNote'].includes(key)?<textarea rows={3} value={v as string||''} onChange={e=>change(e.target.value)}/>:<input value={v as string||''} onChange={e=>change(e.target.value)}/>}</Field>;})}</div>;}
export function ContentEditor(){const {event,change}=useAdmin(),[content,setContent]=useState<Content>(()=>editableContent(event.draft.contentJson)),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[saved,setSaved]=useState<false|'draft'|'published'>(false),[preview,setPreview]=useState<InvitationView|null>(null),[tab,setTab]=useState('event');
const baseline=useMemo(()=>editableContent(event.draft.contentJson),[event.draftRevisionId]);useEffect(()=>{setContent(baseline);},[baseline]);const dirty=JSON.stringify(content)!==JSON.stringify(baseline);
const pendingPublication=event.draftRevisionId!==event.publishedRevisionId;
useEffect(()=>{const f=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',f);return()=>window.removeEventListener('beforeunload',f);},[dirty]);
async function save(publish=false){
 if(busy)return;
 setBusy(true);setError(null);setSaved(false);
 try{
  let version=event.version;
  if(dirty){
   const parsed=contentSchema.safeParse(content);
   if(!parsed.success)throw new Error(parsed.error.issues.map(e=>`${e.path.join('.')}: ${e.message}`).join('\n'));
   const draft=await change(`/admin/events/${event.id}/draft`,'PATCH',{content:parsed.data},{'If-Match':String(version)});
   version=draft.version;
   setSaved('draft');
  }
  if(publish){
   await change(`/admin/events/${event.id}/publish`,'POST',{expectedVersion:version});
   setSaved('published');
  }
 }catch(e){setError(e);}finally{setBusy(false);}
}
function update(k:keyof Content,v:any){setSaved(false);setContent({...content,[k]:v});}
function updateSection(index:number,next:any){update('sections',content.sections.map((s,i)=>i===index?next:s));}
function reorder(index:number,offset:number){const all=[...content.sections],other=index+offset;if(!optionalSections.includes(all[index].type)||other<2||other>=all.length)return;[all[index],all[other]]=[all[other],all[index]];update('sections',all.map((s,i)=>({...s,order:i})));}
return <><PageHead eyebrow="TỪNG CHI TIẾT, MỘT CHÚT THƯƠNG" title="Kể câu chuyện của bạn." description="Cập nhật thiệp để áp dụng nội dung cho các link đang gửi.">
 <Action disabled={busy||dirty} run={async()=>setPreview(await request(`/admin/events/${event.id}/preview`))}><Eye size={16}/> Xem trước</Action>
 <button className="button secondary" disabled={busy||!dirty} onClick={()=>void save()}><Save size={16}/> Lưu bản nháp</button>
 <button className="button" disabled={busy||(!dirty&&!pendingPublication)} onClick={()=>void save(true)}><Check size={16}/>{busy?'Đang xử lý…':event.publishedRevisionId?'Lưu & cập nhật thiệp':'Lưu & công bố thiệp'}</button>
</PageHead>
<div className="editor-status row between" role="status"><span className="row"><span className={'tiny-dot '+(dirty?'gold':'')}/>{dirty?'Có thay đổi chưa lưu':saved==='published'?'Đã cập nhật thiệp đang gửi':saved==='draft'?'Đã lưu bản nháp':'Tất cả thay đổi đã được lưu'}</span><Badge>PHIÊN BẢN {event.version}</Badge></div>
{event.publishedRevisionId&&pendingPublication&&<p className="small muted">Bản nháp đang chờ công bố. Chọn <strong>Lưu &amp; cập nhật thiệp</strong> để các link hiện có nhận nội dung mới.</p>}
<ErrorBox error={error}/>
<fieldset className="editor-fields" disabled={busy}><legend className="sr-only">Nội dung thiệp</legend>
<div className="editor-tabs">{[['event','Thông tin sự kiện'],['sections','Các chặng thiệp'],['theme','Giao diện & nhạc'],['publish','Công bố & tiếp nhận']].map(([key,label])=><button key={key} className={tab===key?'selected':''} onClick={()=>setTab(key)}>{label}</button>)}</div>
{tab==='event'&&<div className="editor-panels">
 <section className="panel form-panel"><p className="eyebrow">01 / NHÂN VẬT CHÍNH</p><h2>Người tốt nghiệp</h2><EditObject value={content.host} onChange={v=>update('host',v)}/></section>
 <section className="panel form-panel"><h2>Liên hệ trên thiệp</h2><EditObject value={content.contact??{phone:'',facebookUrl:''}} onChange={v=>update('contact',v)}/></section>
 <section className="panel form-panel"><p className="eyebrow">02 / NGÀY ĐẶC BIỆT</p><h2>Thông tin buổi lễ</h2><EditObject value={{startAt:content.ceremony.startAt,endAt:content.ceremony.endAt,venueName:content.ceremony.venueName,address:content.ceremony.address,googleMapsUrl:content.ceremony.googleMapsUrl,entranceNote:content.ceremony.entranceNote}} onChange={v=>update('ceremony',{...content.ceremony,...v})}/><MapImageField value={content.ceremony.mapImageAssetId} onChange={id=>{setSaved(false);setError(null);setContent(current=>({...current,ceremony:{...current.ceremony,mapImageAssetId:id}}));}}/></section>
 </div>}
{tab==='sections'&&<div className="editor-panels">
 {content.sections.map((section,index)=><section className="panel form-panel" key={section.id}>
  <div className="section-editor-head">
   <div className="row"><span className="section-index">{String(index+1).padStart(2,'0')}</span><h2>{sectionNames[section.type]}</h2></div>
   <div className="row wrap">
    <label className="check-label"><input type="checkbox" checked={section.enabled} disabled={!optionalSections.includes(section.type)} onChange={e=>updateSection(index,{...section,enabled:e.target.checked})}/> Hiển thị</label>
    <button className="icon-button" aria-label={'Đưa '+sectionNames[section.type]+' lên'} disabled={index<=2||!optionalSections.includes(section.type)} onClick={()=>reorder(index,-1)}><ArrowUp size={17}/></button>
    <button className="icon-button" aria-label={'Đưa '+sectionNames[section.type]+' xuống'} disabled={index===content.sections.length-1||!optionalSections.includes(section.type)} onClick={()=>reorder(index,1)}><ArrowDown size={17}/></button>
   </div>
  </div>
  {section.type==='gallery'&&<p className="small muted">Chặng này hiển thị 30 ảnh cố định theo thứ tự tên tệp.</p>}
  {section.type==='story'&&<div className="items-editor">
   {section.data.items.map((item,i)=><div className="item-editor" key={i}>
    <div className="row between">
     <strong>Mục {i+1}</strong>
     <button className="icon-button danger" aria-label={'Xóa mục '+(i+1)} onClick={()=>updateSection(index,{...section,data:{items:section.data.items.filter((_,n)=>n!==i)}})}><Trash2 size={17}/></button>
    </div>
    <EditObject value={item} onChange={next=>updateSection(index,{...section,data:{items:section.data.items.map((entry,n)=>n===i?next:entry)}})}/>
   </div>)}
   <button className="button secondary" disabled={section.data.items.length>=12} onClick={()=>updateSection(index,{...section,data:{items:[...section.data.items,{id:crypto.randomUUID(),label:'',title:'',body:'',imageAssetId:null}]}})}><Plus size={16}/> Thêm câu chuyện</button>
  </div>}
  {section.type!=='gallery'&&section.type!=='story'&&<EditObject value={section.data} onChange={data=>updateSection(index,{...section,data})}/>}
 </section>)}
 {optionalSections.filter(type=>!content.sections.some(s=>s.type===type)).map(type=><button className="button secondary" key={type} onClick={()=>update('sections',[...content.sections,{id:crypto.randomUUID(),type,enabled:true,order:content.sections.length,data:defaults(type)}])}><Plus size={16}/> Thêm chặng {sectionNames[type]}</button>)}
</div>}
{tab==='theme'&&<div className="editor-panels"><section className="panel form-panel"><h2>Màu sắc & chữ</h2><EditObject value={content.theme} onChange={v=>update('theme',v)}/></section><section className="panel form-panel"><h2>Nhạc nền</h2><p className="small muted">Khi bật nhạc nền, nhạc phát lúc khách chạm Mở thiệp. Khách có thể tắt nhạc trên thiệp.</p><EditObject value={content.music} onChange={v=>update('music',v)} path="music"/></section></div>}
{tab==='publish'&&<div className="editor-panels"><section className="panel form-panel"><Badge tone={event.publishedRevisionId?'green':''}>{event.publishedRevisionId?'Đang công bố':'Chưa công bố'}</Badge><h2>Sẵn sàng gửi một lời mời?</h2><p className="muted">Công bố bản nháp đã lưu để tất cả khách cùng nhìn thấy phiên bản mới.</p><div className="row wrap"><button className="button" disabled={dirty||busy} onClick={()=>void save(true)}><Check size={17}/> Công bố thiệp</button>{event.publishedRevisionId&&<Action confirm="Rút công bố sẽ tạm dừng truy cập và phản hồi của tất cả khách. Tiếp tục?" run={()=>change(`/admin/events/${event.id}/unpublish`,'POST',{expectedVersion:event.version})}>Rút công bố</Action>}</div></section><section className="panel form-panel"><h2>Tiếp nhận phản hồi</h2><p className="muted">Các thiết lập này có hiệu lực ngay.</p>{[['rsvpEnabled','Nhận xác nhận tham dự'],['wishesEnabled','Nhận lời chúc'],['wallEnabled','Hiển thị tường lời chúc']].map(([key,label])=><div className="control-line" key={key}><div><span>{label}</span><small className="muted">{event[key]?'Đang bật':'Đang tắt'}</small></div><Action run={()=>change(`/admin/events/${event.id}/controls`,'PATCH',{expectedVersion:event.version,[key]:!event[key]})}>{event[key]?'Tắt':'Bật'}</Action></div>)}</section></div>}
</fieldset>
{preview&&<Modal title="Xem trước thiệp" onClose={()=>setPreview(null)}><Invitation view={{...preview,preview:true}}/></Modal>}</>;}

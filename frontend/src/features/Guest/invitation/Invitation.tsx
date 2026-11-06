import {googleMapsLink} from '@invite/contracts';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {useParams} from 'react-router-dom';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowDown,ArrowUpRight,CalendarDays,Check,Heart,Music2,VolumeX,GraduationCap,Send} from 'lucide-react';
import type {Content,InvitationView,MediaView,Section} from '@invite/contracts';
import {ApiError,download,request} from '../../../lib/api';
import {Action,ErrorBox,Field,Loading} from '../../../components/ui/index';
import {date} from '../../../utils/date';

export default function Guest(){const {token='',guestName}=useParams(),credential=token.length===5&&guestName?token+'.'+encodeURIComponent(guestName):token;return <GuestData key={credential} token={credential}/>;}
function GuestData({token}:{token:string}) {
  const cache=useQueryClient(), controllers=useRef(new Set<AbortController>()),operations=useRef(new Map<string,{body:string;key:string}>()),[blocked,setBlocked]=useState<unknown>(null);
  const responsesToRefresh=useRef(new Set<'rsvp'|'wish'>());
  const refreshSequence=useRef(0);
  const queryKey=['invitation',token];
  const refreshAllowed=(error:unknown)=>!(error instanceof ApiError&&error.status===401);
  const query=useQuery<InvitationView>({
    queryKey,enabled:!blocked,retry:false,gcTime:0,
    refetchOnWindowFocus:({state})=>refreshAllowed(state.error),
    refetchOnReconnect:({state})=>refreshAllowed(state.error),
    refetchInterval:({state})=>refreshAllowed(state.error)?30000:false,
    queryFn:async({signal})=>{
      const refresh=new Set(responsesToRefresh.current);
      const fresh=await request('/guest/invitation',{signal},token) as InvitationView;
      const previous=cache.getQueryData<InvitationView>(queryKey);
      if(!previous)return fresh;
      // Keep the other form's version so an unseen response change still causes a conflict.
      const rsvp=refresh.has('rsvp')?fresh.rsvp:previous.rsvp;
      const wish=refresh.has('wish')?fresh.wish:previous.wish;
      return {...fresh,rsvp,wish,canWithdrawWish:!!wish&&!wish.deletedAt};
    },
  });
  async function refetchResponse(kind:'rsvp'|'wish'){
    responsesToRefresh.current.add(kind);
    const sequence=++refreshSequence.current;
    // A newer refetch can cancel the current one, so it also carries its pending scope.
    try{await query.refetch();}finally{if(sequence===refreshSequence.current)responsesToRefresh.current.clear();}
  }
  useEffect(()=>()=>{controllers.current.forEach(c=>c.abort());void cache.cancelQueries({queryKey:['invitation',token]});cache.removeQueries({queryKey:['invitation',token]});cache.removeQueries({queryKey:['wall',token]});},[token,cache]);
  async function save(path:string,method:string,body?:unknown){
    const kind=path==='/guest/rsvp'?'rsvp':'wish';
    const c=new AbortController(),scope=method+' '+path,serialized=JSON.stringify(body),previous=operations.current.get(scope);
    // Keep the key after a lost response so a retry can replay a committed write.
    const operation=previous?.body===serialized?previous:{body:serialized,key:crypto.randomUUID()};operations.current.set(scope,operation);controllers.current.add(c);
    try{const result=await request(path,{method,body:serialized,signal:c.signal,headers:{'Idempotency-Key':operation.key}},token);operations.current.delete(scope);
      if(method==='PUT'&&(path==='/guest/rsvp'||path==='/guest/wish'))cache.setQueryData(['invitation',token],(old:InvitationView|undefined)=>old?{...old,[path.endsWith('rsvp')?'rsvp':'wish']:result}:old);
      await refetchResponse(kind);return result;
    }catch(error){
      if(error instanceof ApiError&&[401,404].includes(error.status)){setBlocked(error);cache.removeQueries({queryKey:['invitation',token]});controllers.current.forEach(controller=>controller.abort());}
      else if(error instanceof ApiError&&error.status===409){operations.current.delete(scope);await refetchResponse(kind);}
      throw error;
    }finally{controllers.current.delete(c);}
  }
  if(query.isPending&&!blocked)return <Loading/>;
  if(blocked||query.error&&(!query.data||query.error instanceof ApiError&&[401,404].includes(query.error.status)))return <main className="invitation-error"><GraduationCap size={42}/><h1>Chưa thể mở thiệp</h1><p>Đường dẫn có thể đã hết hiệu lực hoặc thiệp chưa được công bố. Hãy liên hệ người gửi để nhận lời mời mới.</p><ErrorBox error={blocked||query.error}/></main>;
  return <><ErrorBox error={query.error}/><Invitation view={query.data!} token={token} save={save}/></>;
}
export function Invitation({view,token,save}: {view:InvitationView;token?:string;save?:(path:string,method:string,body?:unknown)=>Promise<any>}) {
 const c=view.content,[opened,setOpened]=useState(false),[playing,setPlaying]=useState(false),[audioError,setAudioError]=useState(''),audio=useRef<HTMLAudioElement>(null),root=useRef<HTMLElement>(null),[volume,setVolume]=useState(()=>{try{const stored=localStorage.getItem('graduation.music.volume');return stored===null?c.music.volume:Math.min(1,Math.max(0,Number(stored)||0));}catch{return c.music.volume;}});
 useEffect(()=>{
  if(!opened)return;
  root.current?.scrollIntoView({block:'start',behavior:'instant'});
  root.current?.querySelector<HTMLElement>('.hero-text h1')?.focus({preventScroll:true});
  if(!('IntersectionObserver' in window)||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('arrived');observer.unobserve(entry.target);}},{threshold:.08});
  root.current?.querySelectorAll('.invite-section').forEach(el=>observer.observe(el));return()=>observer.disconnect();
 },[opened]);
 const sections=[...c.sections].filter(s=>s.enabled).sort((a,b)=>a.order-b.order),opening=sections.find(s=>s.type==='opening'),hero=sections.find(s=>s.type==='hero'),name=view.guest.displayName||view.guest.fullName||'Bạn';
 const media=(id?:string|null)=>id?view.media[id]:undefined;
 const img=(id?:string|null,priority=false)=>{const a=media(id);return a?<AssetImage asset={a} priority={priority}/>:<div className="photo-placeholder"><GraduationCap size={70} strokeWidth={.7}/><span>MỘT CHẶNG ĐƯỜNG ĐÁNG NHỚ</span></div>;};
 const year=c.ceremony.startAt?new Intl.DateTimeFormat('vi-VN',{year:'numeric',timeZone:c.timezone}).format(new Date(c.ceremony.startAt)):'…';
 const hasMusic=c.music.enabled&&!!media(c.music.assetId);
 const message=view.personalMessage||(opening?.type==='opening'?opening.data.messageTemplate:'Mời bạn cùng mình lưu giữ khoảnh khắc đáng nhớ.').replaceAll('{{guestName}}',name).replaceAll('{{hostName}}',c.host.fullName).replaceAll('{{salutation}}',view.guest.salutation||'');
 async function music(){if(!audio.current)return;setAudioError('');if(playing){audio.current.pause();setPlaying(false);}else try{await audio.current.play();setPlaying(true);}catch{setAudioError('Chạm nút nhạc để thử phát lại.');}}
 async function open(withMusic:boolean){setOpened(true);if(withMusic)await music();if(token)void request('/guest/opened',{method:'POST'},token).catch(()=>{});}
 const style={'--invite-accent':c.theme.palette==='sage'?'#496255':'#8e3042','--invite-blue':c.theme.palette==='sage'?'#adc5b7':c.theme.palette==='rose'?'#deb9c7':'#a9c8e8','--invite-heading':c.theme.font==='sans'?'Arial, sans-serif':'"Times New Roman", serif'} as CSSProperties;
 return <main ref={root} className={'invitation palette-'+c.theme.palette} style={style}>
  {view.preview&&<div className="preview-banner">BẢN XEM TRƯỚC · Phản hồi không được lưu</div>}
  {hasMusic&&<audio ref={el=>{audio.current=el;if(el)el.volume=volume;}} src={media(c.music.assetId)!.url} loop={c.music.loop} preload="none"/>}
  {!opened?<section className="envelope" aria-label="Phong bì thiệp mời">
   <Butterfly className="butterfly-one"/><Butterfly className="butterfly-two"/><Butterfly className="butterfly-three"/>
   <p className="envelope-heading" aria-hidden="true"><span>Graduation</span><em>Invitation</em></p>
   <p className="eyebrow envelope-school">{c.host.university}</p>
   <div className="paper-envelope">
    <div className="envelope-letter"><p className="eyebrow">{opening?.type==='opening'?opening.data.title:'MỘT LỜI MỜI DÀNH RIÊNG CHO'}</p><h1>{name}</h1><p className="signature">{c.host.fullName}</p></div>
    <div className="envelope-fold" aria-hidden="true"/>
    <button className="wax-seal" aria-label="Mở thiệp" onClick={()=>void open(false)}><GraduationCap size={30} strokeWidth={1}/><span>Mở thiệp</span></button>
   </div>
   <p className="envelope-hint">CHẠM VÀO CON DẤU ĐỂ MỞ THIỆP</p>
   <p className="envelope-message">{message}</p>
   {opening?.type==='opening'&&opening.data.coverAssetId&&<div className="envelope-cover">{img(opening.data.coverAssetId,true)}</div>}
   {hasMusic&&<button className="text-button" onClick={()=>void open(true)}><Music2 size={16}/> Mở thiệp cùng âm nhạc</button>}
   <span className="envelope-year">CLASS OF {year}</span>
  </section>:<>
   <nav className="invite-nav" aria-label="Các phần của thiệp">
    <a className="invite-brand" href="#invitation-top"><GraduationCap size={25} strokeWidth={1.2}/><span>{c.host.fullName}<small>GRADUATION · {year}</small></span></a>
    <div className="invite-nav-links">{sections.some(s=>s.type==='story')&&<a href="#story">Câu chuyện</a>}<a href="#invitation-event">Lời mời</a><a href="#location">Địa điểm</a><a href="#response">Tham dự</a></div>
    {hasMusic&&<div className="invite-music"><button className="icon-button" aria-label={playing?'Tắt nhạc':'Phát nhạc'} aria-pressed={playing} onClick={()=>void music()}>{playing?<Music2 size={18}/>:<VolumeX size={18}/>}</button><label className="music-volume"><span className="sr-only">Âm lượng nhạc nền</span><input type="range" min="0" max="1" step="0.05" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);if(audio.current)audio.current.volume=v;try{localStorage.setItem('graduation.music.volume',String(v));}catch{}}}/></label></div>}
   </nav>
   {audioError&&<p className="music-error" role="status">{audioError}</p>}
   <section className="invite-hero" id="invitation-top">
    <div className="ceremony-heading" aria-hidden="true"><span>Graduation</span><span>Ceremony</span></div>
    <Butterfly className="butterfly-one"/><Butterfly className="butterfly-two"/>
    <div className="admission-ticket"><span>YOU'RE INVITED</span><GraduationCap size={24} strokeWidth={1}/><strong>CLASS OF {year}</strong><span>{date(c.ceremony.startAt)}</span></div>
    <figure className="hero-photo">{img(hero?.type==='hero'?hero.data.heroAssetId:null,true)}<figcaption className="photo-caption">{c.host.fullName}</figcaption></figure>
    <div className="hero-text"><p className="eyebrow">MỘT CHẶNG ĐƯỜNG · MỘT KHỞI ĐẦU MỚI</p><h1 tabIndex={-1}>{hero?.type==='hero'?hero.data.title:'Ngày mình tốt nghiệp.'}</h1><p className="hero-subtitle">{hero?.type==='hero'?hero.data.subtitle:''}</p><p>{c.host.university}<br/>{c.host.major}{c.host.cohort&&' · '+c.host.cohort}</p><a href="#invitation-event" className="text-button">Một lời mời dành riêng cho bạn <ArrowDown size={17}/></a></div>
   </section>
   {sections.filter(s=>!['opening','hero'].includes(s.type)).map((s,index)=><section key={s.id} className={'invite-section section-'+s.type} id={s.type==='invitation'?'invitation-event':s.type==='map'?'location':s.type}><p className="eyebrow section-number">{String(index+1).padStart(2,'0')} / {sectionLabel[s.type]}</p>{renderSection(s)}</section>)}
   <footer className="invite-footer"><GraduationCap size={26}/><p>{c.host.fullName}</p><span>{c.host.university}</span><small>Mong gặp bạn ở một ngày thật đẹp. ✧</small></footer><a href="#response" className="quick-rsvp"><Heart size={16}/> Gửi lời hồi đáp</a>
  </>}
 </main>;
 function renderSection(s:Section){switch(s.type){
  case 'story':return <><h2>Mỗi chặng đường,<br/><em>một điều để nhớ.</em></h2><div className="story-list">{s.data.items.map((item,i)=><article key={item.id} className={'story-item'+(item.imageAssetId?'':' story-letter')}>
   {item.imageAssetId&&<div className="story-image">{img(item.imageAssetId)}</div>}<div><p className="eyebrow">{item.label||`CHƯƠNG ${i+1}`}</p><h3>{item.title}</h3><p>{item.body}</p></div>
  </article>)}</div></>;
  case 'gallery':return <><h2>Cảm ơn vì đã<br/><em>ở trong thanh xuân của mình.</em></h2><div className="gallery">{s.data.items.map((item,i)=><figure key={item.assetId+'-'+i}>{img(item.assetId)}<figcaption>{item.caption}</figcaption></figure>)}</div></>;
  case 'invitation':return <div className="invitation-letter"><Butterfly className="letter-butterfly"/><p className="eyebrow">TRÂN TRỌNG MỜI</p><h2>{s.data.title}</h2><p className="guest-recipient"><span>Kính gửi</span><strong>{name}</strong></p><p className="invite-prose">{s.data.message}</p><div className="event-card"><p className="eyebrow">SAVE THE DATE</p><CalendarDays size={28} strokeWidth={1}/><h3>{date(c.ceremony.startAt)}</h3><p>{c.ceremony.venueName}<br/>{c.ceremony.address}</p><p className="muted">Giờ Việt Nam · GMT+7</p>{token&&<Action run={()=>download('/guest/calendar.ics','loi-moi-tot-nghiep.ics',token)}><CalendarDays size={16}/> Thêm vào lịch</Action>}</div><p className="signature">{c.host.fullName}</p></div>;
  case 'map': {const location=s.data.locationSource==='MEETUP'&&c.meetup?c.meetup:c.ceremony;return <><h2>{s.data.title}</h2><MapView location={location} image={media(location.mapImageAssetId)}/><p className="invite-prose">{s.data.instructions}<br/>{location.entranceNote}</p></>;}
  case 'response':return <><h2>{s.data.title}</h2><p className="invite-prose">{s.data.rsvpIntro}</p><Response view={view} save={save}/><p className="invite-prose">{s.data.wishIntro}</p><WishForm view={view} save={save}/>{token&&<Wall token={token}/>}</>;
  case 'closing':return <div className="closing"><span className="large-star" aria-hidden="true">✧</span><h2>{s.data.message}</h2><p>{view.rsvp?.status==='ATTENDING'?s.data.attendingMessage:view.rsvp?.status==='DECLINED'?s.data.declinedMessage:''}</p><p className="signature">{c.host.fullName}</p></div>;
  default:return null;
 }}
}
function Butterfly({className}:{className:string}){return <svg className={'paper-butterfly '+className} viewBox="0 0 140 104" fill="none" aria-hidden="true"><g fill="currentColor" stroke="#fffdf7" strokeWidth="1.2"><path d="M69 50C52 7 9-7 7 26C5 49 37 65 69 55ZM68 54C41 51 20 66 34 89C46 110 64 78 70 57ZM71 50C88 7 131-7 133 26C135 49 103 65 71 55ZM72 54C99 51 120 66 106 89C94 110 76 78 70 57Z"/><path d="M69 52 20 19M67 56 39 84M71 52 120 19M73 56 101 84M69 53 14 37M71 53 126 37"/></g><path d="M70 42v29m0-28-7-10m7 10 7-10" stroke="#54738d" strokeWidth="2" strokeLinecap="round"/></svg>;}
const sectionLabel:Record<string,string>={opening:'LỜI MỞ',hero:'KHOẢNH KHẮC',story:'CHẶNG ĐƯỜNG',gallery:'NGƯỜI ĐỒNG HÀNH',invitation:'MỘT LỜI HẸN',map:'ĐIỂM HẸN',response:'LỜI HỒI ĐÁP',closing:'HẸN GẶP BẠN'};
function AssetImage({asset,priority,sizes='(max-width: 767px) 86vw, 42vw'}:{asset:MediaView;priority:boolean;sizes?:string}){const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[asset.url]);return failed?<div className="photo-placeholder" role="img" aria-label={asset.alt||'Khoảnh khắc đang được cập nhật'}><GraduationCap size={50} strokeWidth={1}/><span>Ảnh tạm thời không hiển thị</span></div>:<img src={asset.url} alt={asset.alt} width={asset.width||1200} height={asset.height||1500} srcSet={asset.srcSet} sizes={sizes} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'} onError={()=>setFailed(true)}/>;}
function MapView({location,image}:{location:Content['ceremony'];image?:MediaView}){return <div className="map-card">{image&&<div className="campus-map-image"><a href={image.url} target="_blank" rel="noopener noreferrer" aria-label="Mở ảnh sơ đồ trường đầy đủ"><AssetImage asset={image} priority={false} sizes="90vw"/></a></div>}<h3>{location.venueName}</h3><p>{location.address}</p><div className="row map-actions"><Action run={()=>navigator.clipboard.writeText(location.address)}>Sao chép địa chỉ</Action><a className="button secondary" href={googleMapsLink(location)} target="_blank" rel="noopener noreferrer">Mở Google Maps <ArrowUpRight size={17}/></a></div></div>;}
function Response({view,save}: {view:InvitationView;save?:any}) {
 const [status,setStatus]=useState(view.rsvp?.status||'ATTENDING'),[note,setNote]=useState(view.rsvp?.note||''),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 return <form className="guest-form" onSubmit={async e=>{
  e.preventDefault();if(!save)return;setBusy(true);setError(null);setDone(false);
  try{await save('/guest/rsvp','PUT',{status,note,expectedVersion:view.rsvp?.version||0});setDone(true);}catch(e){setError(e);}finally{setBusy(false);}
 }}><fieldset disabled={!view.canRsvp||view.preview||busy}>
  <legend>Bạn có thể đến chung vui không?</legend>
  <p className="response-recipient">Khách mời<strong>{view.guest.displayName||view.guest.fullName||'Bạn'}</strong></p>
  <div className="radio-cards"><label><input type="radio" name="rsvp" checked={status==='ATTENDING'} onChange={()=>setStatus('ATTENDING')}/><Check size={20}/> Mình sẽ đến</label><label><input type="radio" name="rsvp" checked={status==='DECLINED'} onChange={()=>setStatus('DECLINED')}/><Heart size={20}/> Hẹn một dịp khác</label></div>
  <Field label="Nhắn mình một chút (không bắt buộc)"><textarea maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></Field><button className="button" disabled={busy}><Send size={16}/>{busy?'Đang gửi…':'Gửi xác nhận'}</button>
 </fieldset>{!view.canRsvp&&<p className="muted">Hiện đã ngừng nhận xác nhận.</p>}<ErrorBox error={error}/>{done&&<p role="status" className="success">Đã lưu lời hồi đáp của bạn. Cảm ơn bạn!</p>}</form>;
}
function WishForm({view,save}: {view:InvitationView;save?:any}){const [body,setBody]=useState(view.wish?.deletedAt?'':view.wish?.body||''),[consent,setConsent]=useState(view.wish?.consentPublic||false),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[done,setDone]=useState(false);return <form className="guest-form" onSubmit={async e=>{e.preventDefault();if(!save)return;setBusy(true);setError(null);setDone(false);try{await save('/guest/wish','PUT',{body,consentPublic:consent,expectedVersion:view.wish?.version||0});setDone(true);}catch(e){setError(e);}finally{setBusy(false);}}}><fieldset disabled={!view.canCreateOrEditWish||view.preview||busy}><legend>Một lời chúc dành cho mình</legend><Field label="Lời chúc của bạn"><textarea value={body} required maxLength={1000} rows={5} onChange={e=>setBody(e.target.value)} placeholder="Viết một điều bạn muốn gửi gắm…"/></Field><label className="check-label"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Tôi đồng ý hiển thị tên và lời chúc trên thiệp sau khi được duyệt.</label><button className="button" disabled={busy}><Heart size={16}/>{busy?'Đang gửi…':'Gửi lời chúc'}</button></fieldset><ErrorBox error={error}/>{done&&<p role="status" className="success">Lời chúc đã được lưu{consent?' và đang chờ duyệt':''}. Cảm ơn bạn!</p>}{!view.canCreateOrEditWish&&<p className="muted">Hiện đã ngừng nhận lời chúc mới.</p>}{view.canWithdrawWish&&!view.preview&&<div className="row wrap">{view.wish?.consentPublic&&<Action run={async()=>{await save('/guest/wish/visibility','PATCH',{consentPublic:false,expectedVersion:view.wish.version});setConsent(false);}}>Rút đồng ý công khai</Action>}<Action confirm="Bạn muốn xóa lời chúc này?" run={async()=>{await save('/guest/wish','DELETE',{expectedVersion:view.wish.version});setBody('');setConsent(false);}}>Xóa lời chúc</Action></div>}</form>;}
function Wall({token}:{token:string}){const controller=useRef<AbortController|null>(null);const [items,setItems]=useState<any[]>([]),[cursor,setCursor]=useState<string|null>(null),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);async function load(next?:string){const signal=controller.current?.signal;setBusy(true);setError(null);try{const data=await request('/guest/wishes'+(next?'?cursor='+encodeURIComponent(next):''),{signal},token);if(signal?.aborted)return;setError(null);setItems(old=>{const all=next?[...old,...data.items]:data.items;return all.filter((x:any,i:number)=>all.findIndex((v:any)=>v.id===x.id)===i);});setCursor(data.nextCursor);}catch(e){if(!signal?.aborted)setError(e);}finally{if(!signal?.aborted)setBusy(false);}}useEffect(()=>{const c=new AbortController();controller.current=c;void load();const id=setInterval(()=>void load(),30000);return()=>{c.abort();clearInterval(id);};},[token]);return <div className="wish-wall"><h3>Gửi lại những điều thương mến</h3><div className="wish-grid">{items.map(w=><blockquote key={w.id}><Heart size={18}/><p>{w.body}</p><cite>{w.displayName||w.guest?.displayName||w.guestName}</cite>{w.isPinned&&<span className="small muted"> · Lời chúc được ghim</span>}</blockquote>)}</div><ErrorBox error={error}/>{cursor&&<button className="button secondary" disabled={busy} onClick={()=>void load(cursor)}>Xem thêm lời chúc</button>}</div>;}

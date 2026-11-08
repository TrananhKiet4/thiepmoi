import {defaultInvitationNotes,googleMapsLink} from '@invite/contracts';
import {useEffect,useRef,useState} from 'react';
import {useParams} from 'react-router-dom';
import {useInfiniteQuery,useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowDown,ArrowUpRight,CalendarDays,Check,Facebook,Heart,MapPin,Music2,Phone,VolumeX,GraduationCap,Send} from 'lucide-react';
import type {Content,InvitationView,MediaView,PublicWish,Section} from '@invite/contracts';
import {CompanionFilm} from './CompanionFilm';
import {GraduationSchedule} from './GraduationSchedule';
import {statusName} from '../../../constants/status';
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
  if(blocked||query.error&&(!query.data||query.error instanceof ApiError&&[401,404].includes(query.error.status))){
    const error=blocked||query.error;
    const retryable=error instanceof ApiError&&error.status>=500;
    return <main className="invitation-error">
      <GraduationCap size={42}/>
      <h1>Chưa thể mở thiệp</h1>
      {!retryable&&<p>Đường dẫn có thể đã hết hiệu lực hoặc thiệp chưa được công bố. Hãy liên hệ người gửi để nhận lời mời mới.</p>}
      <ErrorBox error={error}/>
      {retryable&&<button type="button" className="button" disabled={query.isFetching} onClick={()=>void query.refetch()}>Thử lại</button>}
    </main>;
  }
  return <><ErrorBox error={query.error}/><Invitation view={query.data!} token={token} save={save}/></>;
}
export function Invitation({view,token,save}: {view:InvitationView;token?:string;save?:(path:string,method:string,body?:unknown)=>Promise<any>}) {
 const [phase,setPhase]=useState<'closed'|'opening'|'opened'>('closed');
 const envelope=useRef<HTMLElement>(null);
 const opened=phase==='opened';
 const c=view.content,[playing,setPlaying]=useState(false),[audioError,setAudioError]=useState(''),audio=useRef<HTMLAudioElement>(null),root=useRef<HTMLElement>(null),[volume,setVolume]=useState(()=>{try{const stored=localStorage.getItem('graduation.music.volume');return stored===null?c.music.volume:Math.min(1,Math.max(0,Number(stored)||0));}catch{return c.music.volume;}});
 useEffect(()=>{
  if(phase!=='opening')return;
  const animation=envelope.current?.getAnimations?.()[0];
  if(!animation){setPhase('opened');return;}
  let active=true;
  const reveal=()=>{if(active)setPhase('opened');};
  void animation.finished.then(reveal,reveal);
  return()=>{active=false;};
 },[phase]);
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
 async function startMusic(){
  const player=audio.current;
  if(!player)return;
  setAudioError('');
  try{await player.play();}
  catch(error){
   if(audio.current===player&&!(error instanceof DOMException&&error.name==='AbortError'))setAudioError('Chạm nút nhạc để thử phát lại.');
  }
 }
 function toggleMusic(){
  const player=audio.current;
  if(player?.paused)void startMusic();
  else player?.pause();
 }
 function open(){
  if(phase!=='closed')return;
  // Start playback while the tap still grants media activation on mobile.
  void startMusic();
  setPhase('opening');
  if(token)void request('/guest/opened',{method:'POST'},token).catch(()=>{});
 }
 return <main ref={root} className={`invitation palette-${c.theme.palette} font-${c.theme.font}`}>
  {view.preview&&<div className="preview-banner">BẢN XEM TRƯỚC · Phản hồi không được lưu</div>}
  {hasMusic&&<audio ref={el=>{audio.current=el;if(el)el.volume=volume;}} src={media(c.music.assetId)!.url} loop={c.music.loop} preload="metadata"
    onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onError={()=>setPlaying(false)}/>}
  {!opened?<section ref={envelope} className={phase==='opening'?'envelope is-opening':'envelope'} aria-label="Phong bì thiệp mời">
   <div className="envelope-panels" aria-hidden="true"/>
   <PaperSparkle className="sparkle-one"/><PaperSparkle className="sparkle-two"/><PaperSparkle className="sparkle-three"/>
   <p className="envelope-heading" aria-hidden="true"><span>Graduation</span><em>Invitation</em></p>
   <p className="eyebrow envelope-school">{c.host.university}</p>
   <div className="paper-envelope">
    <div className="envelope-letter"><p className="eyebrow">{opening?.type==='opening'?opening.data.title:'MỘT LỜI MỜI DÀNH RIÊNG CHO'}</p><h1>{name}</h1><p className="signature">{c.host.fullName}</p></div>
    <div className="envelope-fold" aria-hidden="true"/>
    <button className="wax-seal" aria-label="Mở thiệp" aria-disabled={phase==='opening'} onClick={open}><GraduationCap size={30} strokeWidth={1}/><span>Mở thiệp</span></button>
   </div>
   <p className="envelope-hint">CHẠM VÀO CON DẤU ĐỂ MỞ THIỆP</p>
   <p className="envelope-message">{message}</p>
   {opening?.type==='opening'&&opening.data.coverAssetId&&<div className="envelope-cover">{img(opening.data.coverAssetId,true)}</div>}
   <span className="envelope-year">CLASS OF {year}</span>
  </section>:<>
   <nav className="invite-nav" aria-label="Các phần của thiệp">
    <a className="invite-brand" href="#invitation-top"><GraduationCap size={25} strokeWidth={1.2}/><span>{c.host.fullName}<small>GRADUATION · {year}</small></span></a>
    <div className="invite-nav-links">{sections.some(s=>s.type==='story')&&<a href="#story">Câu chuyện</a>}<a href="#invitation-event">Lời mời</a><a href="#location">Địa điểm</a><a href="#response">Tham dự</a></div>
    {hasMusic&&<div className="invite-music"><button className="icon-button" aria-label={playing?'Tắt nhạc':'Phát nhạc'} onClick={toggleMusic}>{playing?<Music2 size={18}/>:<VolumeX size={18}/>}</button><label className="music-volume"><span className="sr-only">Âm lượng nhạc nền</span><input type="range" min="0" max="1" step="0.05" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);if(audio.current)audio.current.volume=v;try{localStorage.setItem('graduation.music.volume',String(v));}catch{}}}/></label></div>}
   </nav>
   {audioError&&<p className="music-error" role="status">{audioError}</p>}
   <section className="invite-hero" id="invitation-top">
    <div className="ceremony-heading" aria-hidden="true"><span>Graduation</span><span>Ceremony</span></div>
    <div className="hero-art">
     <PaperSparkle className="sparkle-one"/><PaperSparkle className="sparkle-two"/>
     <div className="admission-ticket"><span>YOU'RE INVITED</span><GraduationCap size={24} strokeWidth={1}/><strong>CLASS OF {year}</strong><span>{date(c.ceremony.startAt)}</span></div>
     <figure className="hero-photo">{img(hero?.type==='hero'?hero.data.heroAssetId:null,true)}<figcaption className="photo-caption">{c.host.fullName}</figcaption></figure>
    </div>
    <div className="hero-text"><p className="eyebrow">MỘT CHẶNG ĐƯỜNG · MỘT KHỞI ĐẦU MỚI</p><h1 tabIndex={-1}>{hero?.type==='hero'?hero.data.title:'Ngày mình tốt nghiệp.'}</h1><p className="hero-subtitle">{hero?.type==='hero'?hero.data.subtitle:''}</p><p>{c.host.university}<br/>{c.host.major}{c.host.cohort&&' · '+c.host.cohort}</p><a href="#invitation-event" className="text-button">Một lời mời dành riêng cho bạn <ArrowDown size={17}/></a></div>
   </section>
   <a href="#response" className="quick-rsvp"><Heart size={16}/> Gửi lời hồi đáp</a>
   {sections.filter(s=>!['opening','hero'].includes(s.type)).map(s=><section key={s.id} className={'invite-section section-'+s.type} id={s.type==='invitation'?'invitation-event':s.type==='map'?'location':s.type}><p className="eyebrow section-number">{String(s.order+1).padStart(2,'0')} / {sectionLabel[s.type]}</p>{renderSection(s)}</section>)}
   <InvitationFooter content={c} year={year} mapImage={media(c.ceremony.mapImageAssetId)}/>
  </>}
 </main>;
 function renderSection(s:Section){switch(s.type){
  case 'story':return <><h2>Mỗi chặng đường,<br/><em>một điều để nhớ.</em></h2><div className="story-list">{s.data.items.map((item,i)=><article key={item.id} className={'story-item'+(item.imageAssetId?'':' story-letter')}>
   {item.imageAssetId&&<div className="story-image">{img(item.imageAssetId)}</div>}<div><p className="eyebrow">{item.label||`CHƯƠNG ${i+1}`}</p><h3>{item.title}</h3><p>{item.body}</p></div>
  </article>)}</div></>;
  case 'gallery':return <>
   <h2>Cảm ơn vì đã<br/><em>ở trong thanh xuân của mình.</em></h2>
   <CompanionFilm/>
  </>;
  case 'invitation':return <div className="invitation-letter">
   <PaperSparkle className="letter-sparkle"/>
   <p className="eyebrow">TRÂN TRỌNG MỜI</p>
   <h2>{s.data.title}</h2>
   <p className="guest-recipient"><span>Kính gửi</span><strong>{name}</strong></p>
   <p className="invite-prose">{s.data.message}</p>
   <GraduationSchedule ceremony={c.ceremony} phone={c.contact?.phone} calendarAction={token&&
    <Action run={()=>download('/guest/calendar.ics','loi-moi-tot-nghiep.ics',token)}><CalendarDays size={16}/> Thêm vào lịch</Action>
   }/>
   <p className="signature">{c.host.fullName}</p>
  </div>;
  case 'map': {
   const location=s.data.locationSource==='MEETUP'&&c.meetup?c.meetup:c.ceremony;
   const notes=(s.data.notes??defaultInvitationNotes).split('\n').map(line=>line.trim()).filter(Boolean);
   return <>
    <h2>{s.data.title}</h2>
    <MapView location={location} image={media(location.mapImageAssetId)}/>
    <p className="invite-prose">{s.data.instructions}<br/>{location.entranceNote}</p>
    {notes.length>0&&<aside className="invitation-notes" aria-label="Lưu ý khi đến dự lễ">
     <p className="eyebrow">THÔNG TIN CẦN BIẾT</p>
     <h3>Một chút lưu ý nhỏ</h3>
     <ol>{notes.map((note,index)=><li key={index}>{note}</li>)}</ol>
    </aside>}
   </>;
  }
  case 'response':return <><h2>{s.data.title}</h2><p className="invite-prose">{s.data.rsvpIntro}</p><Response view={view} save={save}/><p className="invite-prose">{s.data.wishIntro}</p><WishForm view={view} save={save}/>{(token&&view.wallEnabled!==false||view.previewWishes!==undefined)&&<Wall key={token} token={token} previewItems={view.previewWishes}/>}</>;
  case 'closing':return <div className="closing"><span className="large-star" aria-hidden="true">✧</span><h2>{s.data.message}</h2><p>{view.rsvp?.status==='ATTENDING'?s.data.attendingMessage:view.rsvp?.status==='DECLINED'?s.data.declinedMessage:''}</p><p className="signature">{c.host.fullName}</p></div>;
  default:return null;
 }}
}
function InvitationFooter({content,year,mapImage}:{content:Content;year:string;mapImage?:MediaView}){
 const {host,ceremony,contact}=content;
 return <footer className="invite-footer scrapbook-footer">
  <div className="footer-details">
   <div>
    <GraduationCap className="footer-emblem" size={34} strokeWidth={1.3} aria-hidden="true"/>
    <h2>{host.university}</h2>
    <address>{ceremony.address}</address>
   </div>
   <div>
    <h2>Liên hệ</h2>
    {contact?.phone&&<a href={'tel:'+contact.phone.replace(/[^+\d]/g,'')}><Phone size={17} aria-hidden="true"/> {contact.phone}</a>}
    {contact?.facebookUrl&&<a href={contact.facebookUrl} target="_blank" rel="noopener noreferrer"><Facebook size={17} aria-hidden="true"/> Facebook</a>}
    {!contact?.phone&&!contact?.facebookUrl&&<span>Liên hệ người gửi thiệp</span>}
   </div>
   <div>
    <h2>Bản đồ</h2>
    <a className="footer-map" href={googleMapsLink(ceremony)} target="_blank" rel="noopener noreferrer" aria-label="Mở Google Maps từ chân thiệp">
     {mapImage&&<AssetImage asset={mapImage} priority={false} sizes="(max-width: 767px) 85vw, 320px"/>}
     <span><MapPin size={16} aria-hidden="true"/> Mở Google Maps <ArrowUpRight size={15} aria-hidden="true"/></span>
    </a>
   </div>
  </div>
  <small>© {year} · {host.fullName}</small>
 </footer>;
}
function PaperSparkle({className}:{className:string}){
 return <svg className={'paper-sparkle '+className} viewBox="0 0 88 84" fill="currentColor" aria-hidden="true">
  <path d="M41 6C44 27 49 32 70 35C49 39 44 44 41 65C37 44 32 39 11 35C32 32 37 27 41 6Z" stroke="#fffdf8" strokeWidth="1.4"/>
  <path d="M72 48Q74 59 85 61Q74 63 72 74Q70 63 59 61Q70 59 72 48ZM15 57Q17 65 25 67Q17 69 15 77Q13 69 5 67Q13 65 15 57Z"/>
  <circle cx="69" cy="15" r="2.5"/><circle cx="24" cy="12" r="1.8"/>
 </svg>;
}
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
function WishForm({view,save}:{view:InvitationView;save?:any}) {
 const wish=view.wish?.deletedAt?null:view.wish;
 const [body,setBody]=useState(wish?.body??'');
 const [consent,setConsent]=useState(!!wish?.consentPublic);
 const [attendanceConsent,setAttendanceConsent]=useState(!!wish?.consentAttendancePublic);
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[done,setDone]=useState('');
 function changeConsent(checked:boolean){
  setConsent(checked);
  if(!checked)setAttendanceConsent(false);
 }
 return <form className="guest-form" onSubmit={async e=>{
  e.preventDefault();
  if(!save)return;
  setBusy(true);
  setError(null);
  setDone('');
  try{
   const saved=await save('/guest/wish','PUT',{body,consentPublic:consent,consentAttendancePublic:consent&&attendanceConsent,expectedVersion:view.wish?.version??0});
   setDone(saved?.moderationStatus==='APPROVED'&&view.wallEnabled!==false
    ?'Lời chúc đã được đăng. Cảm ơn bạn!'
    :'Lời chúc đã được lưu. Cảm ơn bạn!');
  }catch(e){
   if(e instanceof ApiError&&e.status===409)changeConsent(false);
   setError(e);
  }finally{setBusy(false);}
 }}>
  <fieldset disabled={!view.canCreateOrEditWish||view.preview||busy}>
   <legend>Một lời chúc dành cho mình</legend>
   <Field label="Lời chúc của bạn"><textarea value={body} required maxLength={1000} rows={5} onChange={e=>setBody(e.target.value)} placeholder="Viết một điều bạn muốn gửi gắm…"/></Field>
   <label className="check-label"><input type="checkbox" checked={consent} onChange={e=>changeConsent(e.target.checked)}/> Tôi đồng ý hiển thị tên và lời chúc trên thiệp.</label>
   {consent&&<label className="check-label"><input type="checkbox" checked={attendanceConsent} onChange={e=>setAttendanceConsent(e.target.checked)}/> Hiển thị trạng thái tham dự cùng lời chúc</label>}
   <button className="button" disabled={busy}><Heart size={16}/>{busy?'Đang gửi…':'Gửi lời chúc'}</button>
  </fieldset>
  <ErrorBox error={error}/>
  {done&&<p role="status" className="success">{done}</p>}
  {!view.preview&&!view.canCreateOrEditWish&&<p className="muted">Hiện đã ngừng nhận lời chúc mới.</p>}
  {view.canWithdrawWish&&!view.preview&&<div className="row wrap">
   {wish?.consentPublic&&<Action run={async()=>{await save('/guest/wish/visibility','PATCH',{consentPublic:false,expectedVersion:wish.version});changeConsent(false);setDone('');}}>Rút đồng ý công khai</Action>}
   <Action confirm="Bạn muốn xóa lời chúc này?" run={async()=>{await save('/guest/wish','DELETE',{expectedVersion:view.wish.version});setBody('');changeConsent(false);setDone('');}}>Xóa lời chúc</Action>
  </div>}
 </form>;
}

const sampleWishes=[
 {displayName:'Bạn bè',body:'Chúc mừng cậu tốt nghiệp! Mong chặng đường mới đầy niềm vui và tụi mình còn nhiều dịp để ăn mừng cùng nhau.'},
 {displayName:'Đồng nghiệp',body:'Chúc mừng cột mốc mới! Chúc bạn luôn giữ được sự nhiệt tình và gặp nhiều cơ hội để làm điều mình yêu thích.'},
 {displayName:'Gia đình',body:'Cả nhà tự hào về con. Chúc con vững vàng, bình an và luôn vui trên con đường mình chọn.'},
 {displayName:'Thầy cô',body:'Chúc mừng em đã hoàn thành chặng đường đại học. Mong em luôn ham học hỏi và tự tin đón nhận những thử thách mới.'},
 {displayName:'Bạn cùng lớp',body:'Sau bao buổi học và những lần chạy deadline cùng nhau, cuối cùng cũng tới ngày tốt nghiệp. Chúc cậu có một khởi đầu thật đẹp!'},
].map(wish=>({...wish,id:'sample-'+wish.displayName,isPinned:false,attendanceStatus:null}));

function Wall({token,previewItems}:{token?:string;previewItems?:PublicWish[]}) {
 const wall=useInfiniteQuery({
  queryKey:['wall',token],enabled:!!token,gcTime:0,retry:false,
  initialPageParam:null as string|null,
  queryFn:async({signal,pageParam}):Promise<{items:PublicWish[];nextCursor:string|null}>=>{
   const query=pageParam?'?'+new URLSearchParams({cursor:pageParam}):'';
   return request('/guest/wishes'+query,{signal},token);
  },
  getNextPageParam:last=>last.nextCursor,
  refetchInterval:30000,refetchOnWindowFocus:true,
 });
 const {refetch}=wall;
 useEffect(()=>{
  if(!token)return;
  function restore(event:PageTransitionEvent){if(event.persisted)void refetch();}
  window.addEventListener('pageshow',restore);
  return ()=>window.removeEventListener('pageshow',restore);
 },[token,refetch]);
 const items=wall.data?.pages.flatMap(page=>page.items)??[];
 const publicWishes=previewItems??[...new Map(items.map(item=>[item.id,item])).values()];
 const cards=[...publicWishes,...sampleWishes];
 return <div className="wish-wall">
  <h3>Lưu bút & lời chúc</h3>
  <p className="muted small">Vuốt hoặc cuộn ngang để xem thêm</p>
  <div className="wish-strip" role="region" tabIndex={0} aria-label="Lời chúc của khách mời">
   {cards.map(w=><blockquote className="wish-card" key={w.id}>
    <p>{w.body}</p>
    {w.isPinned&&<span className="small muted wish-pin">Lời chúc được ghim</span>}
    <footer>
     {w.attendanceStatus&&<span className="wish-attendance" data-status={w.attendanceStatus}>{statusName[w.attendanceStatus]}</span>}
     <cite>{w.displayName}</cite>
    </footer>
   </blockquote>)}
  </div>
  {wall.isLoading&&<p className="muted" role="status">Đang tải lời chúc…</p>}
  <ErrorBox error={wall.error}/>
  {token&&(wall.hasNextPage||wall.isError)&&<button className="button secondary" disabled={wall.isFetching} onClick={()=>void (wall.isError&&!wall.isFetchNextPageError?refetch():wall.fetchNextPage())}>{wall.isError?'Thử tải lại':'Xem thêm lời chúc'}</button>}
 </div>;
}

import {defaultInvitationNotes,googleMapsLink} from '@invite/contracts';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useParams} from 'react-router-dom';
import {useInfiniteQuery,useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowUpRight,Check,Facebook,Heart,MapPin,Music2,Phone,VolumeX,GraduationCap,Send} from 'lucide-react';
import type {Content,InvitationView,MediaView,PublicWish,Section} from '@invite/contracts';
import {CompanionFilm} from './CompanionFilm';
import {GraduationSchedule} from './GraduationSchedule';
import {statusName} from '../../../constants/status';
import {ApiError,request} from '../../../lib/api';
import {Action,ErrorBox,Field,Loading} from '../../../components/ui/index';

export default function Guest(){const {token='',guestName}=useParams(),credential=token.length===5&&guestName?token+'.'+encodeURIComponent(guestName):token;return <GuestData key={credential} token={credential}/>;}
function useGuestData(token:string){
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
      if(!previous||fresh.familyReply)return fresh;
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
  return {query,save,blocked};
}
function GuestData({token}:{token:string}) {
  const {query,save,blocked}=useGuestData(token);
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
function EnvelopeName({name}:{name:string}) {
 const heading=useRef<HTMLHeadingElement>(null);
 const text=useRef<HTMLSpanElement>(null);
 useLayoutEffect(()=>{
  const box=heading.current!,label=text.current!;
  let active=true;
  function fit(){
   if(!active)return;
   label.style.fontSize='';
   const width=label.getBoundingClientRect().width;
   const available=box.getBoundingClientRect().width;
   if(available>0&&width>available){
    const size=Number.parseFloat(getComputedStyle(box).fontSize);
    label.style.fontSize=`${Math.floor(size*available/width*10)/10}px`;
   }
  }
  fit();
  const observer=new ResizeObserver(fit);
  observer.observe(box);
  void document.fonts.load('400 1em "Fz Alpha Brights"',name).then(fit,fit);
  return()=>{active=false;observer.disconnect();};
 },[name]);
 return <h1 ref={heading}><span ref={text}>{name}</span></h1>;
}
export function Invitation({view,token,save}: {view:InvitationView;token?:string;save?:ReturnType<typeof useGuestData>['save']}) {
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
 const sections=[...c.sections].filter(s=>s.enabled).sort((a,b)=>a.order-b.order),opening=sections.find(s=>s.type==='opening'),hero=sections.find(s=>s.type==='hero'),name=view.guest.recipientName||view.guest.displayName||view.guest.fullName||'Bạn';
 const closingLabel=`Hẹn gặp ${view.guest.recipientAddress||'bạn'}`.toLocaleUpperCase('vi');
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
    <div className="envelope-letter"><p className="eyebrow">{opening?.type==='opening'?opening.data.title:'MỘT LỜI MỜI DÀNH RIÊNG CHO'}</p><EnvelopeName name={name}/></div>
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
     <figure className="hero-photo">{img(hero?.type==='hero'?hero.data.heroAssetId:null,true)}<figcaption className="photo-caption">{c.host.fullName}</figcaption></figure>
    </div>
    <div className="hero-text">
     <p className="eyebrow">MỘT CHẶNG ĐƯỜNG · MỘT KHỞI ĐẦU MỚI</p>
     <h1 tabIndex={-1}>{hero?.type==='hero'?hero.data.title:'Ngày mình tốt nghiệp.'}</h1>
     {hero?.type==='hero'&&hero.data.subtitle&&<p className="hero-subtitle">{hero.data.subtitle}</p>}
     <p>{c.host.university}<br/>{c.host.major}{c.host.cohort&&' · '+c.host.cohort}</p>
    </div>
   </section>
   <a href="#response" className="quick-rsvp"><Heart size={16}/> Gửi lời hồi đáp</a>
   {sections.filter(s=>!['opening','hero'].includes(s.type)).map(s=><section key={s.id} className={'invite-section section-'+s.type} id={s.type==='invitation'?'invitation-event':s.type==='map'?'location':s.type}><p className="eyebrow section-number">{String(s.order+1).padStart(2,'0')} / {s.type==='closing'?closingLabel:sectionLabel[s.type]}</p>{renderSection(s)}</section>)}
   <InvitationFooter content={c} year={year} mapImage={media(c.ceremony.mapImageAssetId)}/>
  </>}
 </main>;
 function renderSection(s:Section){switch(s.type){
  case 'story':return <><h2>Mỗi chặng đường, <em className="section-title-accent">một điều để nhớ.</em></h2><div className="story-list">{s.data.items.map((item,i)=><article key={item.id} className={'story-item'+(item.imageAssetId?'':' story-letter')}>
   {item.imageAssetId&&<div className="story-image">{img(item.imageAssetId)}</div>}<div><p className="eyebrow">{item.label||`CHƯƠNG ${i+1}`}</p><h3>{item.title}</h3><p>{item.body}</p></div>
  </article>)}</div></>;
  case 'gallery':return <>
   <h2>Cảm ơn vì đã <em className="section-title-accent">ở trong thanh xuân của Kiệt.</em></h2>
   <CompanionFilm/>
  </>;
  case 'invitation':return <div className="invitation-letter">
   <PaperSparkle className="letter-sparkle"/>
   <h2>{s.data.title}</h2>
   <p className="guest-recipient"><span>{view.guest.recipientGreeting??'Kính gửi'}</span><strong>{view.guest.salutation&&<span className="recipient-salutation">{view.guest.salutation} </span>}<span className="recipient-name">{name}</span></strong></p>
   <p className="invite-prose">{s.data.message}</p>
   <GraduationSchedule ceremony={c.ceremony} phone={c.contact?.phone} facebookUrl={c.contact?.facebookUrl}/>
  </div>;
  case 'map': {
   const location=s.data.locationSource==='MEETUP'&&c.meetup?c.meetup:c.ceremony;
   const notes=(s.data.notes??defaultInvitationNotes).split('\n').map(line=>line.trim()).filter(Boolean);
   const title=s.data.title.trim();
   return <>
    <h2>{!title||title.toLocaleLowerCase('vi')==='chúng mình gặp nhau ở đây'?'Nơi ta gặp nhau':title}</h2>
    <MapView location={location} image={media(location.mapImageAssetId)}/>
    {location.entranceNote&&<p className="invite-prose">{location.entranceNote}</p>}
    {notes.length>0&&<aside className="invitation-notes" aria-label="Lưu ý khi đến dự lễ">
     <p className="eyebrow">THÔNG TIN CẦN BIẾT</p>
     <h3>Một chút lưu ý nhỏ</h3>
     <ol>{notes.map((note,index)=><li key={index}>{note}</li>)}</ol>
    </aside>}
   </>;
  }
  case 'response':return <><h2>{s.data.title}</h2>{view.familyReply?<FamilyReply view={view} token={token} intro={s.data.wishIntro}/>:<FeedbackForms view={view} token={token} save={save} intro={s.data.wishIntro}/>}</>;
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
const sectionLabel:Record<string,string>={opening:'LỜI MỞ',hero:'KHOẢNH KHẮC',story:'CHẶNG ĐƯỜNG',gallery:'NGƯỜI ĐỒNG HÀNH',invitation:'MỘT LỜI HẸN',map:'ĐIỂM HẸN',response:'LỜI HỒI ĐÁP'};
function AssetImage({asset,priority,sizes='(max-width: 767px) 86vw, 42vw'}:{asset:MediaView;priority:boolean;sizes?:string}){const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[asset.url]);return failed?<div className="photo-placeholder" role="img" aria-label={asset.alt||'Khoảnh khắc đang được cập nhật'}><GraduationCap size={50} strokeWidth={1}/><span>Ảnh tạm thời không hiển thị</span></div>:<img src={asset.url} alt={asset.alt} width={asset.width||1200} height={asset.height||1500} srcSet={asset.srcSet} sizes={sizes} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'} onError={()=>setFailed(true)}/>;}
function MapView({location,image}:{location:Content['ceremony'];image?:MediaView}){return <div className="map-card">{image&&<div className="campus-map-image"><a href={image.url} target="_blank" rel="noopener noreferrer" aria-label="Mở ảnh sơ đồ trường đầy đủ"><AssetImage asset={image} priority={false} sizes="90vw"/></a></div>}<h3>{location.venueName}</h3><p>{location.address}</p><div className="row map-actions"><Action run={()=>navigator.clipboard.writeText(location.address)}>Sao chép địa chỉ</Action><a className="button secondary" href={googleMapsLink(location)} target="_blank" rel="noopener noreferrer">Mở Google Maps <ArrowUpRight size={17}/></a></div></div>;}
function FeedbackForms({view,token,save,intro}:{view:InvitationView;token?:string;save?:ReturnType<typeof useGuestData>['save'];intro:string}){
 return <><FeedbackForm view={view} save={save} intro={intro}/>{(token&&view.wallEnabled!==false||view.previewWishes!==undefined)&&<Wall key={token} token={token} previewItems={view.previewWishes}/>}</>;
}
function FamilyReply({view,token,intro}:{view:InvitationView;token?:string;intro:string}){
 const storageKey=`graduation.family.${token}`;
 const pendingKey=storageKey+'.pending';
 const [credential,setCredential]=useState(()=>{
  try{return token?sessionStorage.getItem(storageKey)??'':'';}catch{return '';}
 });
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
 const operation=useRef<{name:string;key:string}|null>(null);
 const canRegister=!!token&&view.familyReply?.canRegister===true;
 function selectResponder(value:string){
  try{if(value)sessionStorage.setItem(storageKey,value);else sessionStorage.removeItem(storageKey);}catch{}
  setCredential(value);
 }
 if(credential)return <FamilyResponseForms key={credential} credential={credential} intro={intro} onChange={()=>{setName('');selectResponder('');}}/>;
 return <>
  <form className="guest-form" onSubmit={async e=>{
   e.preventDefault();
   const submitted=name.trim();
   if(!canRegister||!submitted||busy)return;
   setBusy(true);setError(null);
   if(operation.current?.name!==submitted){
    let key=crypto.randomUUID();
    try{
     const pending=JSON.parse(sessionStorage.getItem(pendingKey)??'null');
     if(pending?.name===submitted&&typeof pending.key==='string')key=pending.key;
     sessionStorage.setItem(pendingKey,JSON.stringify({name:submitted,key}));
    }catch{}
    operation.current={name:submitted,key};
   }
   try{
    const result=await request('/guest/family-responders',{method:'POST',body:JSON.stringify({name:submitted}),headers:{'Idempotency-Key':operation.current.key}},token);
    operation.current=null;
    selectResponder(result.token);
    try{sessionStorage.removeItem(pendingKey);}catch{}
   }catch(error){setError(error);}finally{setBusy(false);}
  }}>
   <Field label="Người phản hồi"><input value={name} onChange={e=>setName(e.target.value)} maxLength={120} autoComplete="name" required disabled={!canRegister||busy} placeholder="Nhập tên của bạn"/></Field>
   <button type="submit" className="button" disabled={!canRegister||busy||!name.trim()}>{busy?'Đang chuẩn bị…':'Tiếp tục'}</button>
   {!view.preview&&!canRegister&&<p className="muted">Hiện đã ngừng nhận phản hồi mới.</p>}
   <ErrorBox error={error}/>
  </form>
  {(token&&view.wallEnabled!==false||view.previewWishes!==undefined)&&<Wall token={token} previewItems={view.previewWishes}/>}
 </>;
}
function FamilyResponseForms({credential,intro,onChange}:{credential:string;intro:string;onChange:()=>void}){
 const {query,save,blocked}=useGuestData(credential);
 const error=blocked||query.error;
 const unauthorized=error instanceof ApiError&&[401,404].includes(error.status);
 return <>
  <div className="row wrap" style={{justifyContent:'center',marginBottom:16}}>
   <button type="button" className="button secondary" onClick={onChange}>Đổi người phản hồi</button>
  </div>
  <ErrorBox error={error}/>
  {query.error&&!unauthorized&&<Action run={()=>query.refetch()}>Thử lại</Action>}
  {query.isPending&&!blocked&&<Loading/>}
  {query.data&&!blocked&&!unauthorized&&<FeedbackForms view={query.data} token={credential} save={save} intro={intro}/>}
 </>;
}
function FeedbackForm({view,save,intro}:{view:InvitationView;save?:ReturnType<typeof useGuestData>['save'];intro:string}) {
 const wish=view.wish?.deletedAt?null:view.wish;
 const [status,setStatus]=useState<'ATTENDING'|'DECLINED'|''>(view.rsvp?.status??'');
 const [body,setBody]=useState(wish?.body??'');
 const [consent,setConsent]=useState(!!wish?.consentPublic);
 const [attendanceConsent,setAttendanceConsent]=useState(!!wish?.consentAttendancePublic);
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[done,setDone]=useState('');
 const canRsvp=!!save&&!view.preview&&view.canRsvp;
 const canWish=!!save&&!view.preview&&view.canCreateOrEditWish;
 const message=body.trim();
 const sendRsvp=canRsvp&&!!status&&status!==view.rsvp?.status;
 const sendWish=canWish&&!!message&&(message!==wish?.body||consent!==!!wish?.consentPublic||attendanceConsent!==!!wish?.consentAttendancePublic);
 function changeConsent(checked:boolean){
  setConsent(checked);
  if(!checked)setAttendanceConsent(false);
 }
 async function withdraw(remove:boolean){
  if(!save||!wish||busy)return;
  setBusy(true);
  setDone('');
  setError(null);
  try{
   if(remove){
    await save('/guest/wish','DELETE',{expectedVersion:wish.version});
    setBody('');
   }else{
    await save('/guest/wish/visibility','PATCH',{consentPublic:false,expectedVersion:wish.version});
   }
   changeConsent(false);
  }finally{setBusy(false);}
 }
 return <form className="guest-form feedback-form" onSubmit={async e=>{
  e.preventDefault();
  if(!save||busy||(!sendRsvp&&!sendWish))return;
  setBusy(true);
  setError(null);
  setDone('');
  let rsvpSaved=false;
  try{
   if(sendRsvp){
    await save('/guest/rsvp','PUT',{status,note:view.rsvp?.note??'',expectedVersion:view.rsvp?.version??0});
    rsvpSaved=true;
   }
   if(sendWish){
    const saved=await save('/guest/wish','PUT',{body:message,consentPublic:consent,consentAttendancePublic:consent&&attendanceConsent,expectedVersion:view.wish?.version??0});
    const published=saved?.moderationStatus==='APPROVED'&&view.wallEnabled!==false;
    if(rsvpSaved)setDone(published?'Đã lưu xác nhận tham dự và đăng lời chúc. Cảm ơn bạn!':'Đã lưu xác nhận tham dự và lời chúc. Cảm ơn bạn!');
    else setDone(published?'Lời chúc đã được đăng. Cảm ơn bạn!':'Lời chúc đã được lưu. Cảm ơn bạn!');
   }else setDone('Đã lưu lời hồi đáp của bạn. Cảm ơn bạn!');
  }catch(e){
   if(rsvpSaved)setDone('Đã lưu xác nhận tham dự. Bạn có thể gửi lại lời chúc.');
   if(sendWish&&(!sendRsvp||rsvpSaved)&&e instanceof ApiError&&e.status===409)changeConsent(false);
   setError(e);
  }finally{setBusy(false);}
 }}>
  <p className="response-recipient">{view.responderName?'Người phản hồi':'Khách mời'}<strong>{view.responderName||view.guest.recipientName||view.guest.displayName||view.guest.fullName||'Bạn'}</strong></p>
  <fieldset disabled={!canRsvp||busy}>
   <legend>Xác nhận tham dự</legend>
   <div className="radio-cards"><label><input type="radio" name="rsvp" checked={status==='ATTENDING'} onChange={()=>setStatus('ATTENDING')}/><Check size={20}/> Mình sẽ đến</label><label><input type="radio" name="rsvp" checked={status==='DECLINED'} onChange={()=>setStatus('DECLINED')}/><Heart size={20}/> Hẹn một dịp khác</label></div>
   {!view.preview&&!view.canRsvp&&<p className="muted">Hiện đã ngừng nhận xác nhận.</p>}
  </fieldset>
  <fieldset disabled={!canWish||busy}>
   <legend>Một lời chúc dành cho Kiệt</legend>
   {intro&&<p className="feedback-intro">{intro}</p>}
   <Field label="Lời chúc của bạn"><textarea value={body} maxLength={1000} rows={4} onChange={e=>setBody(e.target.value)} placeholder="Viết lời chúc nếu bạn muốn…"/></Field>
   <label className="check-label"><input type="checkbox" checked={consent} onChange={e=>changeConsent(e.target.checked)}/> Tôi đồng ý hiển thị tên và lời chúc trên thiệp.</label>
   {consent&&<label className="check-label"><input type="checkbox" checked={attendanceConsent} onChange={e=>setAttendanceConsent(e.target.checked)}/> Hiển thị trạng thái tham dự cùng lời chúc</label>}
   {!view.preview&&!view.canCreateOrEditWish&&<p className="muted">Hiện đã ngừng nhận lời chúc mới.</p>}
  </fieldset>
  <button type="submit" className="button feedback-submit" disabled={busy||(!sendRsvp&&!sendWish)}><Send size={16}/>{busy?'Đang xử lý…':'Gửi lời hồi đáp'}</button>
  <ErrorBox error={error}/>
  {done&&<p role="status" className="success">{done}</p>}
  {save&&view.canWithdrawWish&&!view.preview&&<div className="row wrap">
   {wish?.consentPublic&&<Action disabled={busy} run={()=>withdraw(false)}>Rút đồng ý công khai</Action>}
   <Action disabled={busy} confirm="Bạn muốn xóa lời chúc này?" run={()=>withdraw(true)}>Xóa lời chúc</Action>
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

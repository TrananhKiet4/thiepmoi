import {useEffect,useRef,useState} from 'react';
import {companionPhotos} from './companion-photos';

const rowCount=4;
const filmRows=Array.from({length:rowCount},(_,index)=>companionPhotos.slice(
 Math.floor(index*companionPhotos.length/rowCount),
 Math.floor((index+1)*companionPhotos.length/rowCount),
));
const reducedMotion='(prefers-reduced-motion: reduce)';

export function CompanionFilm(){
 const frame=useRef<HTMLDivElement>(null);
 const directions=useRef([1,-1,1,-1]);
 const started=useRef(false);
 const [paused,setPaused]=useState(()=>window.matchMedia(reducedMotion).matches);

 useEffect(()=>{
  const preference=window.matchMedia(reducedMotion);
  const change=()=>{if(preference.matches)setPaused(true);};
  preference.addEventListener('change',change);
  return ()=>preference.removeEventListener('change',change);
 },[]);

 useEffect(()=>{
  const film=frame.current;
  if(paused||!film||!('IntersectionObserver' in window))return;
  const rows=Array.from(film.querySelectorAll<HTMLElement>('.film-row'));
  let timer:number|undefined;
  const observer=new IntersectionObserver(([entry])=>{
   window.clearInterval(timer);
   if(!entry?.isIntersecting)return;
   if(!started.current){
    // Give reverse rows room to move while keeping every photo in filename order.
    rows.forEach((row,index)=>{
     if(index%2&&row.scrollLeft===0)row.scrollLeft=Math.min(row.clientWidth*.45,row.scrollWidth-row.clientWidth);
    });
    started.current=true;
   }
   timer=window.setInterval(()=>{
    if(document.hidden)return;
    rows.forEach((row,index)=>{
     const end=row.scrollWidth-row.clientWidth;
     if(end<2)return;
     if(row.scrollLeft>=end-1)directions.current[index]=-1;
     else if(row.scrollLeft<=0)directions.current[index]=1;
     row.scrollLeft+=directions.current[index];
    });
   },40);
  });
  observer.observe(film);
  return ()=>{observer.takeRecords();observer.disconnect();window.clearInterval(timer);};
 },[paused]);

 return <>
  <div className="companion-film-controls">
   <span>Vuốt ngang để xem ảnh</span>
   <button className="text-button" type="button" onClick={()=>setPaused(current=>!current)}>
    {paused?'Chạy dải ảnh':'Tạm dừng dải ảnh'}
   </button>
  </div>
  <div className="companion-gallery" ref={frame} onPointerDown={()=>setPaused(true)} onFocusCapture={()=>setPaused(true)}>
   {filmRows.map((photos,index)=><div className="film-row" key={photos[0].id} role="region" aria-label={`Dải ảnh ${index+1} trên ${rowCount}`} tabIndex={0}>
    {photos.map(({id,width,height,smallWidth})=>{
     const path='/invitation-assets/photos/companions/'+id;
     const ratio=width/height;
     return <figure key={id}>
      <a href={path+'.webp'} target="_blank" rel="noopener noreferrer" aria-label={`Xem ảnh ${id} đầy đủ`}>
       <img src={path+'.webp'} srcSet={`${path}-small.webp ${smallWidth}w, ${path}.webp ${width}w`}
        sizes={`(max-width: 767px) ${Math.ceil(110*ratio)}px, ${Math.ceil(176*ratio)}px`}
        width={width} height={height} alt={`Ảnh kỷ niệm cùng người đồng hành ${id}`} loading="lazy" decoding="async"/>
      </a>
     </figure>;
    })}
   </div>)}
  </div>
 </>;
}

import {companionPhotoPath,companionPhotos} from '@invite/contracts';

const rowCount=4;
const slotsPerRow=15;
const photosByNumber=new Map(companionPhotos.map(photo=>[Number(photo.id),photo]));
const filmRows=Array.from({length:rowCount},(_,row)=>Array.from({length:slotsPerRow},(_,index)=>row*slotsPerRow+index+1));

export function CompanionFilm(){
 return <div className="companion-gallery">
  {filmRows.map((slots,index)=><div className="film-row" key={slots[0]} role="region" aria-label={`Dải ảnh ${index+1} trên ${rowCount}`}>
   <div className="film-track">
    {[false,true].map(copy=><div className="film-strip" key={Number(copy)} aria-hidden={copy||undefined}>
     {slots.map(slot=>{
      const photo=photosByNumber.get(slot);
      if(!photo)return <figure className="film-slot-empty" key={slot} data-slot={slot} aria-hidden="true"/>;
      const {id,file,width,height,smallWidth}=photo;
      const path=companionPhotoPath(file);
      const ratio=width/height;
      return <figure key={slot} data-slot={slot}>
       <a href={path+'.webp'} target="_blank" rel="noopener noreferrer" tabIndex={copy?-1:undefined}
        aria-label={copy?undefined:`Xem ảnh ${id} đầy đủ`}>
        <img src={path+'.webp'} srcSet={smallWidth<width?`${path}-small.webp ${smallWidth}w, ${path}.webp ${width}w`:undefined}
         sizes={`(max-width: 767px) ${Math.ceil(110*ratio)}px, ${Math.ceil(176*ratio)}px`}
         width={width} height={height} style={{aspectRatio:`${width} / ${height}`}}
         alt={copy?'':`Ảnh kỷ niệm cùng người đồng hành ${id}`} loading="lazy" decoding="async"/>
       </a>
      </figure>;
     })}
    </div>)}
   </div>
  </div>)}
 </div>;
}

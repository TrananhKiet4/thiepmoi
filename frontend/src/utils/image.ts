export async function prepareImage(file:File):Promise<File>{
 if(file.size>5*1024*1024)throw new Error('Ảnh tối đa 5 MB');
 const header=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const signature=Array.from(header).map(byte=>byte.toString(16).padStart(2,'0')).join('');
 if(!signature.startsWith('89504e470d0a1a0a')&&!signature.startsWith('ffd8ff')&&!(signature.startsWith('52494646')&&signature.slice(16,24)==='57454250')){
  throw new Error('Vui lòng chọn ảnh JPG, PNG hoặc WebP');
 }
 const image=new Image(),url=URL.createObjectURL(file);
 try{
  image.src=url;
  await image.decode();
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('2d');
  if(!context)throw new Error('Trình duyệt chưa hỗ trợ xử lý ảnh');
  let scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
  for(let attempt=0;attempt<4;attempt++){
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   context.drawImage(image,0,0,canvas.width,canvas.height);
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',.82));
   if(!blob)throw new Error('Không xử lý được ảnh đã chọn');
   if(blob.size<=1.5*1024*1024){
    const extension=blob.type==='image/webp'?'webp':'png';
    return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.'+extension,{type:blob.type});
   }
   scale*=Math.min(.8,Math.sqrt(1.5*1024*1024/blob.size)*.9);
  }
  throw new Error('Ảnh quá lớn sau khi nén, vui lòng chọn ảnh nhỏ hơn');
 }finally{URL.revokeObjectURL(url);}
}


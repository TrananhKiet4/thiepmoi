import {parentPort,workerData} from 'node:worker_threads';
import ExcelJS from 'exceljs';
import yauzl from 'yauzl';

async function validateZip(bytes) {
 await new Promise((resolve,reject)=>yauzl.fromBuffer(bytes,{lazyEntries:true,validateEntrySizes:true},(error,zip)=>{
  if(error)return reject(new Error('File XLSX không hợp lệ'));
  let count=0,total=0,done=false;
  const fail=e=>{if(!done){done=true;zip.close();reject(e);}};
  zip.on('error',fail);zip.on('end',()=>{if(!done){done=true;resolve();}});
  zip.on('entry',entry=>{
   if(++count>2000||entry.uncompressedSize>20*1024*1024||entry.generalPurposeBitFlag&1||/vbaProject|externalLinks|(^|\/)\.\.(\/|$)/i.test(entry.fileName))return fail(new Error('Archive vượt giới hạn hoặc chứa nội dung không được phép'));
   zip.openReadStream(entry,(err,stream)=>{
    if(err)return fail(err);let size=0;
    stream.on('data',chunk=>{size+=chunk.length;total+=chunk.length;if(total>20*1024*1024||size>entry.uncompressedSize){stream.destroy();fail(new Error('Dữ liệu giải nén vượt 20 MB'));}});
    stream.on('error',fail);stream.on('end',()=>{if(!done)zip.readEntry();});
   });
  });zip.readEntry();
 }));
}
function cellString(cell) {
 const value=cell.value;
 if(value===null||value===undefined)return '';
 if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return String(value).trim();
 if(value.richText)return value.richText.map(part=>part.text).join('').trim();
 if(value.text&&!value.formula&&!value.sharedFormula)return String(value.text).trim();
 throw new Error('Kiểu ô không được hỗ trợ');
}
try {
 const bytes=Buffer.from(workerData.bytes);await validateZip(bytes);
 const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
 if(book.worksheets.length>50)throw new Error('Tối đa 50 sheet');
 const sheets=book.worksheets.map(sheet=>{
  if(sheet.columnCount>100)throw new Error('Tối đa 100 cột');
  const headers=[];for(let col=1;col<=sheet.columnCount;col++)headers.push(cellString(sheet.getCell(1,col)));
  return {name:sheet.name,headers};
 });
 if(!workerData.sheet){parentPort.postMessage({sheets});}
 else {
  const sheet=book.getWorksheet(workerData.sheet);if(!sheet)throw new Error('Không tìm thấy sheet');
  if(sheet.rowCount>2001)throw new Error('Tối đa 2.000 dòng dữ liệu');
  const headers=sheets.find(s=>s.name===sheet.name).headers;
  for(const header of Object.values(workerData.mapping))if(!header||headers.filter(h=>h===header).length!==1)throw new Error('Tiêu đề mapping thiếu hoặc bị trùng');
  const rows=[];
  for(let row=2;row<=sheet.rowCount;row++){
   const values={},errors=[];let nonempty=false;
   for(let col=1;col<=sheet.columnCount;col++){
    const cell=sheet.getCell(row,col);if(cell.value!==null&&cell.value!==undefined)nonempty=true;
    if(cell.value&&typeof cell.value==='object'&&('formula' in cell.value||'sharedFormula' in cell.value))errors.push({column:headers[col-1]||String(col),message:'Không cho phép công thức trong vùng dữ liệu'});
   }
   for(const [key,header] of Object.entries(workerData.mapping)){
    const cell=sheet.getCell(row,headers.indexOf(header)+1);
    if(key==='phone'&&typeof cell.value==='number')errors.push({column:key,message:'Số điện thoại phải là ô Text để giữ số 0 đầu'});
    try{values[key]=cellString(cell);}catch{values[key]='';if(!errors.length)errors.push({column:key,message:'Kiểu ô không được hỗ trợ'});}
   }
   if(nonempty)rows.push({row,values,errors});
  }
  parentPort.postMessage({sheets,rows});
 }
}catch(error){parentPort.postMessage({error:error.message||'Không đọc được XLSX'});}

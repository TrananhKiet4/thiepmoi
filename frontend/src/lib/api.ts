import {useQuery} from '@tanstack/react-query';

export const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
let csrf = '';
export function setCsrf(value: string) { csrf = value; }
export class ApiError extends Error { constructor(public status: number, public code: string, message: string, public fields?: Record<string,string>) { super(message); } }
export async function request(path: string, options: RequestInit = {}, token?: string) {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  else if (options.method && options.method !== 'GET') headers.set('X-CSRF-Token', csrf);
  const response = await fetch(base + path, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) { const e = await response.json().catch(() => ({})); throw new ApiError(response.status,e.error?.code || 'REQUEST_FAILED', e.error?.message || 'Không thể kết nối. Vui lòng thử lại.',e.error?.fields); }
  if (response.status === 204) return null;
  return (await response.json()).data;
}
export function useApi(path: string, enabled = true) { return useQuery({ queryKey: [path], queryFn: ({signal}) => request(path, {signal}), enabled, retry: false }); }
export function write(path: string, method: string, data?: unknown, token?: string, extra?: HeadersInit) { return request(path, {method, headers: extra, body: data === undefined ? undefined : JSON.stringify(data)}, token); }
export async function prepareUpload(eventId:string,file:File,purpose:'IMPORT'):Promise<{mode:'multipart'}|{mode:'direct';uploadId:string}>{
  const upload=await write(`/admin/events/${eventId}/uploads`,'POST',{name:file.name,bytes:file.size,purpose});
  if(upload.mode==='direct'){
    const response=await fetch(upload.url,{method:'PUT',headers:upload.headers,body:file,credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw new Error('Không tải được file lên kho lưu trữ. Vui lòng thử lại.');
  }
  return upload;
}
export async function download(path: string, name: string, token?: string) {
  let response = await fetch(base + path, {headers: token ? {Authorization:`Bearer ${token}`} : {},credentials:'same-origin',cache:'no-store'});
  if (!response.ok) { const data = await response.json().catch(()=>({})); throw new Error(data.error?.message || 'Không tải được file'); }
  if(response.headers.get('content-type')?.includes('application/json')){
    const {data}=await response.json();
    response=await fetch(data.downloadUrl,{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
    if(!response.ok)throw new Error('Link tải đã hết hạn. Vui lòng tải lại.');
  }
  const url=URL.createObjectURL(await response.blob()), a=document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

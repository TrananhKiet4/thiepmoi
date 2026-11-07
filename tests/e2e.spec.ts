import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import type { Page } from '@playwright/test';
import {demoMediaId} from '@invite/contracts';
import {fileURLToPath} from 'node:url';
import {demoContent} from '../backend/prisma/data/demo.js';
function credentialFromLink(url:string){const [,,code,slug]=new URL(url).pathname.split('/');return code.length===5?code+'.'+slug:code;}

test('configured admin alias signs in through the username field',async({page})=>{
 await page.goto('/admin');await page.getByLabel('Email').fill('admin');
 await page.getByLabel('Mật khẩu').fill(process.env.ADMIN_BOOTSTRAP_PASSWORD!);
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Một ngày đáng nhớ.',exact:true})).toBeVisible();
});

test('Vietnamese serif heading renders with one font family instead of mixed fallback glyphs',async({page})=>{
 await page.goto('/admin');await expect(page.getByRole('button',{name:'Đăng nhập',exact:true})).toBeVisible();
 const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root}=await cdp.send('DOM.getDocument');
 const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.login-art h1'});const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
 expect(new Set(fonts.filter(f=>f.glyphCount>0).map(f=>f.familyName)).size).toBe(1);
});

test('simplified event editor loads legacy drafts clean and exposes Maps instead of coordinates',async({page})=>{
 await page.goto('/admin');await page.getByLabel('Email').fill(process.env.ADMIN_BOOTSTRAP_EMAIL!);await page.getByLabel('Mật khẩu').fill(process.env.ADMIN_BOOTSTRAP_PASSWORD!);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Một ngày đáng nhớ.'})).toBeVisible();await navigate(page,'Nội dung');
 await expect(page.getByLabel('Link Google Maps',{exact:true})).toBeVisible();
 for(const label of ['Vĩ độ','Kinh độ'])await expect(page.getByLabel(label,{exact:true})).toHaveCount(0);
 for(const title of ['Hẹn gặp & chụp ảnh','Hạn tiếp nhận','Lời mở theo nhóm khách'])await expect(page.getByRole('heading',{name:title,exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Chọn ảnh sơ đồ trường',{exact:true})).toBeVisible();
 await expect(page.locator('.editor-status')).toContainText('Tất cả thay đổi đã được lưu');
});

test('blue invitation preview renders both new Vietnamese fonts',async({page},testInfo)=>{
 await page.goto('/admin');
 await page.getByLabel('Email').fill(process.env.ADMIN_BOOTSTRAP_EMAIL!);
 await page.getByLabel('Mật khẩu').fill(process.env.ADMIN_BOOTSTRAP_PASSWORD!);
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Một ngày đáng nhớ.'})).toBeVisible();
 const before=(await (await page.request.get('/api/v1/admin/events/current')).json()).data;
 const me=(await (await page.request.get('/api/v1/admin/auth/me')).json()).data;
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('DOM.enable');await cdp.send('CSS.enable');
 try{
  await navigate(page,'Nội dung');
  await page.getByRole('button',{name:'Giao diện & nhạc',exact:true}).click();
  await page.getByLabel('Bảng màu',{exact:true}).selectOption('blue',{timeout:5000});
  for(const [value,family] of [['lora','Lora'],['be-vietnam-pro','Be Vietnam Pro']]){
   await page.getByLabel('Kiểu chữ',{exact:true}).selectOption(value);
   await page.getByRole('button',{name:'Lưu bản nháp',exact:true}).click();
   await expect(page.locator('.editor-status')).toContainText('Đã lưu bản nháp');
   await page.getByRole('button',{name:'Xem trước',exact:true}).click();
   const dialog=page.getByRole('dialog');
   await expect(dialog.locator('.invitation')).toHaveCSS('background-color','rgb(241, 246, 252)');
   await expect(dialog.locator('.envelope h1')).toHaveCSS('color','rgb(35, 76, 124)');
   await expect.poll(async()=>{
    const {root}=await cdp.send('DOM.getDocument');
    const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.envelope h1'});
    const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
    return [...new Set(fonts.filter(font=>font.glyphCount>0).map(font=>font.familyName))];
   }).toEqual([family]);
   if(value==='lora'){
    await dialog.screenshot({path:`.data/qa/blue-envelope-${testInfo.project.name}.png`});
    await dialog.getByRole('button',{name:'Mở thiệp',exact:true}).click();
    await expect(dialog.locator('.invite-hero')).toBeVisible();
    await dialog.screenshot({path:`.data/qa/blue-invitation-${testInfo.project.name}.png`,animations:'disabled'});
   }
   await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
  }
 }finally{
  const current=(await (await page.request.get('/api/v1/admin/events/current')).json()).data;
  if(current.draftRevisionId!==before.draftRevisionId){
   const restored=await page.request.patch(`/api/v1/admin/events/${before.id}/draft`,{
    headers:{Origin:process.env.APP_ORIGIN!,'X-CSRF-Token':me.csrfToken,'If-Match':String(current.version)},
    data:{content:before.draft.contentJson},
   });
   expect(restored.ok()).toBe(true);
  }
 }
});

test('mobile invitation balances headings and plays music on open',async({page},testInfo)=>{
 const content=demoContent(null);
 content.host.fullName='Nguyễn Minh Anh';
 content.theme={palette:'blue',font:'be-vietnam-pro'};
 content.music={enabled:true,assetId:'test-music',volume:.25,loop:true};
 const clip=fileURLToPath(new URL('./fixtures/silent-invitation.mp3',import.meta.url)).replaceAll('\\','/');
 const audioUrl='/@fs/'+clip;
 await page.route('**/api/v1/guest/invitation',route=>route.fulfill({json:{data:{
  content,media:{'test-music':{url:audioUrl}},guest:{displayName:'Khách thử nghiệm'},
  personalMessage:'Thân mời bạn dự lễ tốt nghiệp.',canRsvp:true,canCreateOrEditWish:true,wallEnabled:false,
 }}}));
 await page.route('**/api/v1/guest/opened',route=>route.fulfill({json:{data:{}}}));
 for(const font of ['be-vietnam-pro','lora'] as const){
  content.theme.font=font;
  await page.setViewportSize({width:320,height:760});
  await page.goto('/i/'+'x'.repeat(43));
  const audio=page.locator('audio');
  await expect(audio).toHaveJSProperty('paused',true);
  const open=page.getByRole('button',{name:'Mở thiệp',exact:true});
  if(testInfo.project.use.hasTouch)await open.tap();
  else await open.click();
  await expect(page.getByRole('button',{name:'Tắt nhạc',exact:true})).toBeVisible();
  await expect.poll(()=>audio.evaluate((player:HTMLAudioElement)=>player.currentTime)).toBeGreaterThan(.05);
  await expect(page.getByRole('link',{name:'Gửi lời hồi đáp',exact:true})).toHaveCSS('position','static');
  await page.evaluate(async()=>{await document.fonts.ready;});
  for(const width of [320,375,390,430]){
   await page.setViewportSize({width,height:760});
   const metrics=await page.locator('.invitation').evaluate(root=>{
    const outer=root.getBoundingClientRect();
    const selectors=['.ceremony-heading span:first-child','.admission-ticket strong','.invite-nav-links'];
    const fits=selectors.every(selector=>{
     const range=document.createRange();
     range.selectNodeContents(root.querySelector(selector)!);
     return Array.from(range.getClientRects()).every(rect=>rect.left>=outer.left-1&&rect.right<=outer.right+1);
    });
    const heading=root.querySelector('.hero-text h1')!.firstChild!;
    const lines=new Map<number,number>();
    for(const word of heading.textContent!.matchAll(/\S+/g)){
     const range=document.createRange();
     range.setStart(heading,word.index!);
     range.setEnd(heading,word.index!+word[0].length);
     const top=Math.round(range.getBoundingClientRect().top);
     lines.set(top,(lines.get(top)??0)+1);
    }
    return {fits,lineCount:lines.size,lastLineWords:[...lines.values()].at(-1)};
   });
   expect(metrics.fits,`${font} at ${width}px`).toBe(true);
   expect(metrics.lineCount,`${font} at ${width}px`).toBeLessThanOrEqual(2);
   expect(metrics.lastLineWords,`${font} at ${width}px`).toBeGreaterThan(1);
  }
  await page.getByRole('button',{name:'Tắt nhạc',exact:true}).click();
  await expect(audio).toHaveJSProperty('paused',true);
  await page.getByRole('button',{name:'Phát nhạc',exact:true}).click();
  await expect(audio).toHaveJSProperty('paused',false);
  if(font==='be-vietnam-pro'){
   await page.setViewportSize({width:390,height:844});
   await page.screenshot({path:`.data/qa/mobile-invitation-polish-${testInfo.project.name}.png`,animations:'disabled'});
  }
 }
});

test('campus map selection survives draft save and renders in preview',async({page},testInfo)=>{
 await page.goto('/admin');await page.getByLabel('Email').fill(process.env.ADMIN_BOOTSTRAP_EMAIL!);await page.getByLabel('Mật khẩu').fill(process.env.ADMIN_BOOTSTRAP_PASSWORD!);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Một ngày đáng nhớ.'})).toBeVisible();
 const before=(await (await page.request.get('/api/v1/admin/events/current')).json()).data,me=(await (await page.request.get('/api/v1/admin/auth/me')).json()).data;
 try{
  await navigate(page,'Nội dung');await page.getByLabel('Link Google Maps',{exact:true}).fill('https://maps.app.goo.gl/School123');
  const picker=page.getByLabel('Chọn ảnh sơ đồ trường',{exact:true});
  await picker.selectOption(demoMediaId);
  await expect(page.getByRole('img',{name:'Sơ đồ trường đã chọn',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Lưu bản nháp',exact:true}).click();await expect(page.locator('.editor-status')).toContainText('Đã lưu bản nháp');
  const saved=(await (await page.request.get('/api/v1/admin/events/current')).json()).data.draft.contentJson;
  expect(saved.ceremony.googleMapsUrl).toBe('https://maps.app.goo.gl/School123');expect(saved.ceremony.mapImageAssetId).toBe(demoMediaId);expect(saved.meetup).toBeNull();expect(saved.rsvpDeadline).toBeNull();expect(saved.wishDeadline).toBeNull();expect(saved.groupMessages).toEqual({});expect(saved.ceremony.latitude).toBeUndefined();
  await page.screenshot({path:`.data/qa/map-editor-${testInfo.project.name}.png`,fullPage:true});
  await page.getByRole('button',{name:'Xem trước',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Mở thiệp',exact:true}).click();
  const map=dialog.locator('.campus-map-image img');await map.scrollIntoViewIfNeeded();
  await expect(map).toHaveAttribute('src','/invitation-assets/photos/demo.webp');
  await expect.poll(()=>map.evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0);
  await expect(dialog.getByRole('link',{name:'Mở Google Maps',exact:true})).toHaveAttribute('href','https://maps.app.goo.gl/School123');await expect(dialog.locator('iframe')).toHaveCount(0);await expect(dialog.getByText('Hạn phản hồi:',{exact:false})).toHaveCount(0);
  await page.screenshot({path:`.data/qa/campus-map-preview-${testInfo.project.name}.png`});await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
  await page.reload();await expect(picker).toHaveValue(demoMediaId);await expect(page.getByLabel('Link Google Maps',{exact:true})).toHaveValue('https://maps.app.goo.gl/School123');await expect(page.locator('.editor-status')).toContainText('Tất cả thay đổi đã được lưu');
 }finally{
  const current=(await (await page.request.get('/api/v1/admin/events/current')).json()).data;
  if(current.draftRevisionId!==before.draftRevisionId){
   const restored=await page.request.patch(`/api/v1/admin/events/${before.id}/draft`,{headers:{Origin:process.env.APP_ORIGIN!,'X-CSRF-Token':me.csrfToken,'If-Match':String(current.version)},data:{content:before.draft.contentJson}});expect(restored.ok()).toBe(true);
  }
 }
});

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Mở menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name, exact: true }).click();
}

test('paginated import keeps whole-batch errors blocking commit on every page', async ({page})=>{
 await page.goto('/admin');await page.getByLabel('Email').fill(process.env.ADMIN_BOOTSTRAP_EMAIL!);await page.getByLabel('Mật khẩu').fill(process.env.ADMIN_BOOTSTRAP_PASSWORD!);
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.getByRole('heading',{name:'Một ngày đáng nhớ.'})).toBeVisible();
 await navigate(page,'Nhập Excel');
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Guests'),suffix=Date.now().toString(36).toUpperCase();sheet.addRow(['guest_code','full_name']);
 for(let i=0;i<201;i++)sheet.addRow(['PAGE'+suffix+i,'Guest '+i]);sheet.addRow(['BAD CODE','Invalid guest code']);
 await page.getByLabel('File Excel').setInputFiles({name:'pages.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await book.xlsx.writeBuffer())});
 await page.getByRole('button',{name:'Đọc file',exact:true}).click();await expect(page.getByRole('heading',{name:'Ghép cột dữ liệu'})).toBeVisible();
 await page.getByRole('button',{name:'Kiểm tra dữ liệu'}).click();await expect(page.getByRole('heading',{name:'Kết quả kiểm tra'})).toBeVisible();
 const navigation=page.locator('[aria-label="Phân trang kết quả nhập"]');await expect(navigation).toContainText('Trang 1 / 3');
 await navigation.getByRole('button',{name:'Trang sau',exact:true}).click();await expect(navigation).toContainText('Trang 2 / 3');
 await expect(page.getByRole('button',{name:'Xác nhận nhập',exact:true})).toBeDisabled();await expect(page.getByRole('alert')).toContainText('Có 1 lỗi');
 await navigation.getByRole('button',{name:'Trang sau',exact:true}).click();await expect(navigation).toContainText('Trang 3 / 3');
 await expect(navigation.getByRole('button',{name:'Trang sau',exact:true})).toBeDisabled();
});

test('admin can sign in and navigate all management areas', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Email').fill(process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@example.test');
  await page.getByLabel('Mật khẩu').fill(process.env.ADMIN_BOOTSTRAP_PASSWORD || 'Development-only-123!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Một ngày đáng nhớ.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Thư viện', exact: true, includeHidden: true })).toHaveCount(0);
  for (const [name, title] of [['Nội dung', 'Kể câu chuyện của bạn.'], ['Khách mời', 'Những người đồng hành.'], ['Nhập Excel', 'Danh sách, gọn gàng hơn.'], ['Phản hồi', 'Một lời hẹn, thật gần.'], ['Lời chúc', 'Những lời thương mến.']]) {
    await navigate(page, name);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
});

test('published guest links receive updates and open feedback without losing typed replies or conflict checks',async({page,context})=>{
 test.setTimeout(180000);
 await page.goto('/admin');await page.getByLabel('Email').fill(process.env.ADMIN_BOOTSTRAP_EMAIL!);await page.getByLabel('Mật khẩu').fill(process.env.ADMIN_BOOTSTRAP_PASSWORD!);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Một ngày đáng nhớ.',exact:true})).toBeVisible();
 const before=(await (await page.request.get('/api/v1/admin/events/current')).json()).data,me=(await (await page.request.get('/api/v1/admin/auth/me')).json()).data,headers={Origin:process.env.APP_ORIGIN!,'X-CSRF-Token':me.csrfToken};
 const guestPage=await context.newPage(),suffix=Date.now().toString(36),marker='Thông tin cập nhật '+suffix;
 try{
  expect((await page.request.patch(`/api/v1/admin/events/${before.id}/controls`,{headers,data:{expectedVersion:before.version,rsvpEnabled:false,wishesEnabled:false}})).ok()).toBe(true);
  const created=(await (await page.request.post(`/api/v1/admin/events/${before.id}/guests`,{headers,data:{guestCode:'LIVE'+suffix.toUpperCase(),fullName:'Khách cập nhật '+suffix}})).json()).data;
  const link=(await (await page.request.get(`/api/v1/admin/invitations/${created.invitation.id}/link`)).json()).data.url;
  await guestPage.clock.install();await guestPage.goto(link);await guestPage.getByRole('button',{name:'Mở thiệp',exact:true}).click();
  const gallery=guestPage.locator('#gallery'),photos=gallery.locator('.companion-gallery figure > a');
  const photoPaths=Array.from({length:30},(_,index)=>`/invitation-assets/photos/companions/${String(index+1).padStart(2,'0')}.webp`);
  await expect(gallery.getByText('04 / NGƯỜI ĐỒNG HÀNH',{exact:true})).toBeVisible();
  await expect(photos).toHaveCount(30);
  expect(await photos.evaluateAll(links=>links.map(link=>link.getAttribute('href')))).toEqual(photoPaths);
  const images=photos.locator('img');
  await expect(images).toHaveCount(30);
  expect(await images.evaluateAll(nodes=>nodes.map(image=>image.getAttribute('src')))).toEqual(photoPaths);
  expect(await images.evaluateAll(nodes=>nodes.every(image=>getComputedStyle(image).objectFit==='contain'&&image.getAttribute('loading')==='lazy'))).toBe(true);
  await expect(guestPage.getByRole('button',{name:'Gửi xác nhận',exact:true})).toBeDisabled();await expect(guestPage.getByRole('button',{name:'Gửi lời chúc',exact:true})).toBeDisabled();
  await page.reload();await expect(page.getByRole('heading',{name:'Một ngày đáng nhớ.',exact:true})).toBeVisible();await navigate(page,'Nội dung');await page.getByLabel('Ngành học',{exact:true}).fill(marker);
  const publish=page.getByRole('button',{name:'Lưu & cập nhật thiệp',exact:true});await expect(publish).toBeVisible();await publish.click();
  await expect(page.locator('.editor-status')).toContainText('Đã cập nhật thiệp đang gửi');
  await page.getByRole('button',{name:'Công bố & tiếp nhận',exact:true}).click();
  for(const label of ['Nhận xác nhận tham dự','Nhận lời chúc']){const row=page.locator('.control-line').filter({hasText:label});await row.getByRole('button',{name:'Bật',exact:true}).click();await expect(row.getByRole('button',{name:'Tắt',exact:true})).toBeVisible();}
  await guestPage.bringToFront();await guestPage.clock.fastForward(31000);
  await expect(guestPage.getByText(marker,{exact:false})).toBeVisible();await expect(guestPage.getByRole('button',{name:'Gửi xác nhận',exact:true})).toBeEnabled();await expect(guestPage.getByRole('button',{name:'Gửi lời chúc',exact:true})).toBeEnabled();
  const note=guestPage.getByLabel('Nhắn mình một chút (không bắt buộc)',{exact:true}),wish=guestPage.getByLabel('Lời chúc của bạn',{exact:true});
  await note.fill('Ghi chú đang soạn');await wish.fill('Lời chúc đang soạn');
  const external=await page.request.put('/api/v1/guest/rsvp',{headers:{Authorization:'Bearer '+credentialFromLink(link),'Idempotency-Key':crypto.randomUUID()},data:{status:'DECLINED',note:'Từ thiết bị khác',expectedVersion:0}});expect(external.ok()).toBe(true);
  const externalWish=await page.request.put('/api/v1/guest/wish',{headers:{Authorization:'Bearer '+credentialFromLink(link),'Idempotency-Key':crypto.randomUUID()},data:{body:'Lời chúc từ thiết bị khác',consentPublic:false,expectedVersion:0}});expect(externalWish.ok()).toBe(true);
  await guestPage.clock.fastForward(31000);await expect(note).toHaveValue('Ghi chú đang soạn');await expect(wish).toHaveValue('Lời chúc đang soạn');
  await guestPage.getByRole('button',{name:'Gửi xác nhận',exact:true}).click();await expect(guestPage.locator('.guest-form').first().getByRole('alert')).toContainText('Dữ liệu đã thay đổi');
  await expect(note).toHaveValue('Ghi chú đang soạn');await guestPage.getByRole('button',{name:'Gửi xác nhận',exact:true}).click();await expect(guestPage.locator('.guest-form').first().getByRole('status')).toContainText('Đã lưu');
  await guestPage.getByRole('button',{name:'Gửi lời chúc',exact:true}).click();await expect(guestPage.locator('.guest-form').nth(1).getByRole('alert')).toContainText('Dữ liệu đã thay đổi');
  await expect(wish).toHaveValue('Lời chúc đang soạn');await guestPage.getByRole('button',{name:'Gửi lời chúc',exact:true}).click();await expect(guestPage.getByText('Lời chúc đã được lưu. Cảm ơn bạn!',{exact:true})).toBeVisible();
  let release!:()=>void,started!:()=>void,first=true;
  const held=new Promise<void>(resolve=>release=resolve),refreshStarted=new Promise<void>(resolve=>started=resolve);
  const pattern='**/api/v1/guest/invitation';
  await guestPage.route(pattern,async route=>{if(first){first=false;started();await held;}await route.continue().catch(()=>{});});
  try{
   guestPage.once('dialog',dialog=>dialog.accept());
   await guestPage.getByRole('button',{name:'Xóa lời chúc',exact:true}).click();await refreshStarted;
   await note.fill('Cập nhật trong lúc tải lại lời chúc');
   await guestPage.getByRole('button',{name:'Gửi xác nhận',exact:true}).click();
   await expect(guestPage.locator('.guest-form').first().getByRole('status')).toContainText('Đã lưu');
   await expect(guestPage.getByRole('button',{name:'Xóa lời chúc',exact:true})).toHaveCount(0);
  }finally{release();await guestPage.unrouteAll({behavior:'wait'});}
 }finally{
  await guestPage.close();let current=(await (await page.request.get('/api/v1/admin/events/current')).json()).data;
  const published=before.published?.contentJson??before.draft.contentJson;
  current=(await (await page.request.patch(`/api/v1/admin/events/${before.id}/draft`,{headers:{...headers,'If-Match':String(current.version)},data:{content:published}})).json()).data;
  if(before.publishedRevisionId)current=(await (await page.request.post(`/api/v1/admin/events/${before.id}/publish`,{headers,data:{expectedVersion:current.version}})).json()).data;
  if(before.draftRevisionId!==before.publishedRevisionId)current=(await (await page.request.patch(`/api/v1/admin/events/${before.id}/draft`,{headers:{...headers,'If-Match':String(current.version)},data:{content:before.draft.contentJson}})).json()).data;
  expect((await page.request.patch(`/api/v1/admin/events/${before.id}/controls`,{headers,data:{expectedVersion:current.version,rsvpEnabled:before.rsvpEnabled,wishesEnabled:before.wishesEnabled}})).ok()).toBe(true);
 }
});

test('invalid invitation does not expose cached personal details', async ({ page }) => {
  await page.goto('/i/not-a-valid-token');
  await expect(page.getByRole('heading', { name: 'Chưa thể mở thiệp' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('admin login fits a small screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('real Excel invitations, private responses, moderation, link rotation and export', async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36).toUpperCase();
  const first = 'E2E' + suffix + 'A', second = 'E2E' + suffix + 'B', third = 'E2E' + suffix + 'C';
  const guestName = 'Khách đầu ' + suffix, otherName = 'Khách sau ' + suffix;
  const wishText = 'Chúc một hành trình mới thật đẹp ' + suffix;
  await page.goto('/admin');
  await page.getByLabel('Email').fill(process.env.ADMIN_BOOTSTRAP_EMAIL!);
  await page.getByLabel('Mật khẩu').fill(process.env.ADMIN_BOOTSTRAP_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Một ngày đáng nhớ.' })).toBeVisible();
  const event = (await (await page.request.get('/api/v1/admin/events/current')).json()).data;
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Khách mời');
  sheet.addRow(['guest_code', 'full_name', 'display_name', 'phone']);
  sheet.addRow([first, guestName, guestName, '0900123456']);
  sheet.addRow([second, otherName, otherName, '0900654321']);
  sheet.addRow([third, 'Khách xem lưu bút ' + suffix]);
  await navigate(page, 'Nhập Excel');
  await page.getByLabel('File Excel').setInputFiles({ name: 'khach-moi.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await book.xlsx.writeBuffer()) });
  await page.getByRole('button', { name: 'Đọc file', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ghép cột dữ liệu' })).toBeVisible();
  await page.getByRole('button', { name: 'Kiểm tra dữ liệu' }).click();
  await expect(page.getByRole('heading', { name: 'Kết quả kiểm tra' })).toBeVisible();
  await expect(page.getByRole('cell', { name: new RegExp(first) })).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận nhập', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã nhập danh sách');
  await navigate(page, 'Nội dung');
  await page.getByRole('button', { name: 'Công bố & tiếp nhận' }).click();
  await page.getByRole('button', { name: 'Công bố thiệp', exact: true }).click();
  await expect(page.locator('.topbar')).toContainText('Đang công bố');
  const guests = (await (await page.request.get(`/api/v1/admin/events/${event.id}/guests?q=E2E${suffix}`)).json()).data.items;
  const g1 = guests.find((g: any) => g.guestCode === first), g2 = guests.find((g: any) => g.guestCode === second);
  expect(g1.phone).toBe('0900123456');
  const firstLink = (await (await page.request.get(`/api/v1/admin/invitations/${g1.invitation.id}/link`)).json()).data.url;
  const secondLink = (await (await page.request.get(`/api/v1/admin/invitations/${g2.invitation.id}/link`)).json()).data.url;
  const thirdGuest = guests.find((g: any) => g.guestCode === third);
  const thirdLink = (await (await page.request.get(`/api/v1/admin/invitations/${thirdGuest.invitation.id}/link`)).json()).data.url;
  expect(new URL(firstLink).pathname).toMatch(new RegExp('/i/[A-Za-z0-9]{5}/khach-dau-'+suffix.toLowerCase()+'$'));
  expect(new URL(secondLink).pathname).toMatch(new RegExp('/i/[A-Za-z0-9]{5}/khach-sau-'+suffix.toLowerCase()+'$'));
  const guestPage = await context.newPage();
  await guestPage.goto(firstLink.replace(/\/[^/]+$/,'/khach-khac'));
  await expect(guestPage.getByRole('heading',{name:'Chưa thể mở thiệp',exact:true})).toBeVisible();
  await expect(guestPage.getByText(guestName,{exact:true})).toHaveCount(0);
  let databaseBusy = true;
  await guestPage.route('**/api/v1/guest/invitation', route => databaseBusy ? route.fulfill({
    status: 503,
    headers: { 'Retry-After': '2' },
    json: { error: { code: 'DATABASE_BUSY', message: 'Hệ thống đang bận, vui lòng thử lại sau ít giây' } },
  }) : route.continue());
  await guestPage.goto(firstLink);
  await expect(guestPage.getByText('Hệ thống đang bận, vui lòng thử lại sau ít giây')).toBeVisible();
  const retry = guestPage.getByRole('button', { name: 'Thử lại', exact: true });
  await expect(retry).toBeVisible();
  databaseBusy = false;
  await retry.click();
  await expect(guestPage.getByRole('heading', { name: guestName, exact: true })).toBeVisible();
  const originalViewport=guestPage.viewportSize()!;
  for(const width of [320,375,390]){
    await guestPage.setViewportSize({width,height:900});
    expect(await guestPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const lines=await guestPage.locator('.envelope-heading>span').evaluate(element=>{const range=document.createRange();range.selectNodeContents(element);return range.getClientRects().length;});
    expect(lines).toBe(1);
  }
  await guestPage.setViewportSize(originalViewport);
  await guestPage.screenshot({path:`.data/qa/guest-envelope-${testInfo.project.name}.png`,fullPage:true});
  await guestPage.locator('.envelope-year').scrollIntoViewIfNeeded();
  await guestPage.getByRole('button', { name: 'Mở thiệp', exact: true }).press('Enter');
  await expect(guestPage.locator('.hero-text h1')).toBeFocused();
  await expect.poll(()=>guestPage.evaluate(()=>scrollY)).toBe(0);
  await guestPage.setViewportSize({...originalViewport,height:1300});
  await guestPage.screenshot({path:`.data/qa/guest-hero-${testInfo.project.name}.png`,animations:'disabled'});
  await guestPage.setViewportSize(originalViewport);
  await expect(guestPage.locator('.guest-recipient').first()).toContainText(guestName);
  await expect(guestPage.locator('.guest-form').first()).toContainText(guestName);
  await expect(guestPage.getByRole('textbox', { name: 'Họ và tên', exact: true })).toHaveCount(0);
  await guestPage.getByRole('navigation', { name: 'Các phần của thiệp' }).getByRole('link', { name: 'Địa điểm', exact: true }).click();
  await expect(guestPage.locator('#location')).toBeInViewport();
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await guestPage.setViewportSize({ width, height: 900 });
    expect(await guestPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await guestPage.setViewportSize(originalViewport);
  await guestPage.getByRole('button', { name: 'Gửi xác nhận', exact: true }).click();
  await expect(guestPage.locator('.guest-form').first().getByRole('status')).toContainText('Đã lưu lời hồi đáp');
  await guestPage.locator('.guest-form').first().screenshot({path:`.data/qa/guest-response-${testInfo.project.name}.png`});
  await guestPage.getByLabel('Lời chúc của bạn', { exact: true }).fill(wishText);
  await guestPage.getByLabel('Tôi đồng ý hiển thị tên và lời chúc').check();
  await guestPage.getByLabel('Hiển thị trạng thái tham dự cùng lời chúc').check();
  await guestPage.getByRole('button', { name: 'Gửi lời chúc', exact: true }).click();
  await expect(guestPage.getByText('Lời chúc đã được lưu và đang chờ duyệt. Cảm ơn bạn!', { exact: true })).toBeVisible();
  await guestPage.evaluate(path => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')); }, new URL(secondLink).pathname);
  await expect(guestPage.getByRole('heading', { name: otherName, exact: true })).toBeVisible();
  await expect(guestPage.getByText(guestName, { exact: true })).toHaveCount(0);
  expect(await guestPage.evaluate(() => localStorage.length)).toBe(0);
  await guestPage.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
  await expect(guestPage.locator('.guest-recipient').first()).toContainText(otherName);
  await expect(guestPage.locator('.guest-form').first()).toContainText(otherName);
  await expect(guestPage.locator('.guest-form').first().getByRole('status')).toHaveCount(0);
  await navigate(page, 'Lời chúc');
  const card = page.locator('.moderation-card').filter({ hasText: wishText });
  await card.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await expect(card).toHaveCount(0);
  await guestPage.reload();
  await guestPage.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
  const wishCard = guestPage.getByRole('region', { name: 'Lời chúc của khách mời' })
    .locator('.wish-card').filter({ hasText: wishText });
  await expect(wishCard.getByText(wishText, { exact: true })).toBeVisible();
  await expect(wishCard.locator('footer')).toContainText(guestName);
  await expect(wishCard.locator('footer')).toContainText('Sẽ tham dự');
  await expect(guestPage.locator('.wish-wall').getByRole('alert')).toHaveCount(0);
  const secondWish = 'Chúc mừng tốt nghiệp ' + suffix;
  await guestPage.getByLabel('Lời chúc của bạn', { exact: true }).fill(secondWish);
  await guestPage.getByLabel('Tôi đồng ý hiển thị tên và lời chúc').check();
  await guestPage.getByRole('button', { name: 'Gửi lời chúc', exact: true }).click();
  await expect(guestPage.getByText('Lời chúc đã được lưu và đang chờ duyệt. Cảm ơn bạn!', { exact: true })).toBeVisible();
  await page.reload();
  await page.locator('.moderation-card').filter({ hasText: secondWish }).getByRole('button', { name: 'Duyệt', exact: true }).click();
  await guestPage.goto(thirdLink);
  await guestPage.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
  const strip = guestPage.getByRole('region', { name: 'Lời chúc của khách mời' });
  const samples = strip.locator('.wish-card').filter({
    has: guestPage.locator('cite', { hasText: /^(Bạn bè|Đồng nghiệp|Gia đình|Thầy cô|Bạn cùng lớp)$/ }),
  });
  await expect(samples.locator('cite')).toHaveText(['Bạn bè', 'Đồng nghiệp', 'Gia đình', 'Thầy cô', 'Bạn cùng lớp']);
  await expect(samples.locator('.wish-attendance')).toHaveCount(0);
  await guestPage.setViewportSize({ width: 320, height: 800 });
  await expect(strip.getByText(secondWish, { exact: true })).toBeVisible();
  await expect(strip.getByText(wishText, { exact: true })).toBeAttached();
  expect(await strip.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await strip.focus();
  await strip.press('ArrowRight');
  await expect.poll(() => strip.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  expect(await guestPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await guestPage.setViewportSize(originalViewport);
  await guestPage.goto(firstLink);
  await guestPage.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
  await expect(guestPage.locator('.wish-wall').getByText(wishText, { exact: true })).toHaveCount(0);
  await guestPage.getByLabel('Lời chúc của bạn', { exact: true }).fill(wishText + ' — đã chỉnh sửa');
  await guestPage.getByRole('button', { name: 'Gửi lời chúc', exact: true }).click();
  await expect(guestPage.getByText('Lời chúc đã được lưu và đang chờ duyệt. Cảm ơn bạn!', { exact: true })).toBeVisible();
  await guestPage.goto(secondLink);
  await guestPage.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
  await expect(guestPage.locator('.wish-wall').getByText('Đang tải lời chúc…')).toHaveCount(0);
  await expect(guestPage.locator('.wish-wall').getByText(wishText, { exact: true })).toHaveCount(0);
  await expect(guestPage.locator('.wish-wall').getByText(wishText + ' — đã chỉnh sửa', { exact: true })).toHaveCount(0);
  await navigate(page, 'Khách mời');
  await page.getByRole('textbox', { name: 'Tìm khách mời' }).fill(first);
  await page.getByRole('button', { name: 'Lấy link ' + guestName, exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Cấp lại link', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await guestPage.goto(firstLink);
  await expect(guestPage.getByRole('heading', { name: 'Chưa thể mở thiệp' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất Excel', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  const current = (await (await page.request.get(`/api/v1/admin/events/${event.id}/guests?q=${first}`)).json()).data.items[0];
  expect(current.invitation.rsvp.status).toBe('ATTENDING');
  expect(current.invitation.wish.body).toBe(wishText + ' — đã chỉnh sửa');
  const currentLink = (await (await page.request.get(`/api/v1/admin/invitations/${current.invitation.id}/link`)).json()).data.url;
  const remove = page.getByRole('button', { name: 'Xóa khách mời ' + guestName, exact: true });
  page.once('dialog', dialog => dialog.dismiss());
  await remove.click();
  await expect(remove).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await remove.click();
  await expect(page.getByText('Chưa có khách phù hợp.', { exact: false })).toBeVisible();
  await guestPage.goto(currentLink);
  await expect(guestPage.getByRole('heading', { name: 'Chưa thể mở thiệp' })).toBeVisible();
  await guestPage.goto(secondLink);
  await expect(guestPage.getByRole('heading', { name: otherName, exact: true })).toBeVisible();
});

test('an unfinished date can be saved as a draft and blocks publication', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Email').fill(process.env.ADMIN_BOOTSTRAP_EMAIL!);
  await page.getByLabel('Mật khẩu').fill(process.env.ADMIN_BOOTSTRAP_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Một ngày đáng nhớ.' })).toBeVisible();
  const before = (await (await page.request.get('/api/v1/admin/events/current')).json()).data;
  const me = (await (await page.request.get('/api/v1/admin/auth/me')).json()).data;
  try {
    await navigate(page, 'Nội dung');
    const ceremony = page.locator('.form-panel').filter({ has: page.getByRole('heading', { name: 'Thông tin buổi lễ', exact: true }) });
    await ceremony.getByLabel('Thời gian bắt đầu (giờ Việt Nam)', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
    await expect(page.locator('.editor-status')).toContainText('Đã lưu bản nháp');
    const draft = (await (await page.request.get('/api/v1/admin/events/current')).json()).data;
    expect(draft.draft.contentJson.ceremony.startAt).toBe('');
    await page.getByRole('button',{name:'Xem trước',exact:true}).click();
    const preview=page.getByRole('dialog');
    await expect(preview.locator('.envelope-year')).toHaveText('CLASS OF …');
    await preview.getByRole('button',{name:'Mở thiệp',exact:true}).click();
    await expect(preview.locator('.hero-text h1')).toBeVisible();
    await preview.getByRole('button',{name:'Đóng',exact:true}).click();
    await page.getByRole('button', { name: 'Công bố & tiếp nhận', exact: true }).click();
    await page.getByRole('button', { name: 'Công bố thiệp', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Vui lòng hoàn thiện nội dung');
  } finally {
    const current = (await (await page.request.get('/api/v1/admin/events/current')).json()).data;
    const restored = await page.request.patch(`/api/v1/admin/events/${before.id}/draft`, { headers: { 'X-CSRF-Token': me.csrfToken, 'If-Match': String(current.version), Origin: process.env.APP_ORIGIN! }, data: { content: before.draft.contentJson } });
    expect(restored.ok()).toBe(true);
  }
});

test('invitation controls remain reachable in a tall mobile dialog', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Email').fill(process.env.ADMIN_BOOTSTRAP_EMAIL!);
  await page.getByLabel('Mật khẩu').fill(process.env.ADMIN_BOOTSTRAP_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Một ngày đáng nhớ.' })).toBeVisible();
  const event = (await (await page.request.get('/api/v1/admin/events/current')).json()).data;
  const guest = (await (await page.request.get(`/api/v1/admin/events/${event.id}/guests?pageSize=1`)).json()).data.items[0];
  await navigate(page, 'Khách mời');
  await page.getByRole('textbox', { name: 'Tìm khách mời' }).fill(guest.guestCode);
  await page.getByRole('button', { name: 'Lấy link ' + guest.fullName, exact: true }).click();
  const button = page.getByRole('button', { name: 'Cấp lại link', exact: true });
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await button.click({ trial: true, timeout: 5000 });
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a lost RSVP response retries the same operation and a version conflict preserves typed notes', async ({ page, context }) => {
  await page.goto('/admin');
  await page.getByLabel('Email').fill(process.env.ADMIN_BOOTSTRAP_EMAIL!);
  await page.getByLabel('Mật khẩu').fill(process.env.ADMIN_BOOTSTRAP_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Một ngày đáng nhớ.' })).toBeVisible();
  const event = (await (await page.request.get('/api/v1/admin/events/current')).json()).data;
  const me = (await (await page.request.get('/api/v1/admin/auth/me')).json()).data;
  const headers = { 'X-CSRF-Token': me.csrfToken, Origin: process.env.APP_ORIGIN! };
  const created = await page.request.post(`/api/v1/admin/events/${event.id}/guests`, { headers, data: { guestCode: 'RETRY' + Date.now().toString(36).toUpperCase(), fullName: 'Khách kiểm tra gửi lại' } });
  expect(created.ok()).toBe(true);
  const guest = (await created.json()).data;
  const link = (await (await page.request.get(`/api/v1/admin/invitations/${guest.invitation.id}/link`)).json()).data.url;
  const guestPage = await context.newPage(), keys: string[] = [];
  let drop = true;
  await guestPage.route('**/api/v1/guest/rsvp', async route => {
    keys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch();
    if (drop) { drop = false; expect(response.ok()).toBe(true); await route.abort('failed'); }
    else await route.fulfill({ response });
  });
  await guestPage.goto(link);
  await guestPage.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
  const form = guestPage.locator('.guest-form').first();
  await form.getByRole('button', { name: 'Gửi xác nhận', exact: true }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  await form.getByRole('button', { name: 'Gửi xác nhận', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('Đã lưu lời hồi đáp');
  expect(keys[1]).toBe(keys[0]);
  const token = credentialFromLink(link);
  const external = await page.request.put('/api/v1/guest/rsvp', { headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': crypto.randomUUID() }, data: { status: 'DECLINED', note: 'Thay đổi từ phiên khác', expectedVersion: 1 } });
  expect(external.ok()).toBe(true);
  const note = form.getByLabel('Nhắn mình một chút (không bắt buộc)', { exact: true });
  let failRefresh = true;
  await guestPage.route('**/api/v1/guest/invitation', async route => {
    if (failRefresh) { failRefresh = false; await route.abort('failed'); }
    else await route.continue();
  });
  await note.fill('Ghi chú vẫn còn khi có xung đột');
  await form.getByRole('button', { name: 'Gửi xác nhận', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Dữ liệu đã thay đổi');
  await expect(form.getByRole('status')).toHaveCount(0);
  await expect(note).toHaveValue('Ghi chú vẫn còn khi có xung đột');
  await form.getByRole('button', { name: 'Gửi xác nhận', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Dữ liệu đã thay đổi');
  await expect(form.getByRole('status')).toHaveCount(0);
  await expect(note).toHaveValue('Ghi chú vẫn còn khi có xung đột');
  await form.getByRole('button', { name: 'Gửi xác nhận', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('Đã lưu lời hồi đáp');
  await expect(form.getByRole('alert')).toHaveCount(0);
  const record = (await (await page.request.get(`/api/v1/admin/events/${event.id}/guests?q=${guest.guestCode}`)).json()).data.items[0];
  expect(record.invitation.rsvp.version).toBe(3);
  expect(record.invitation.rsvp.note).toBe('Ghi chú vẫn còn khi có xung đột');
  const rotated = await page.request.post(`/api/v1/admin/invitations/${guest.invitation.id}/rotate`, { headers, data: { expectedVersion: record.invitation.version } });
  expect(rotated.ok()).toBe(true);
  await note.fill('Ghi chú riêng khi đường dẫn bị thu hồi');
  await form.getByRole('button', { name: 'Gửi xác nhận', exact: true }).click();
  await expect(guestPage.getByRole('heading', { name: 'Chưa thể mở thiệp' })).toBeVisible();
  await expect(note).toHaveCount(0);
});

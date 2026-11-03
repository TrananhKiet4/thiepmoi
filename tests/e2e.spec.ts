import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import type { Page } from '@playwright/test';

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Mở menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name, exact: true }).click();
}

test('admin can sign in and navigate all management areas', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Email').fill(process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@example.test');
  await page.getByLabel('Mật khẩu').fill(process.env.ADMIN_BOOTSTRAP_PASSWORD || 'Development-only-123!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Một ngày đáng nhớ.' })).toBeVisible();
  for (const [name, title] of [['Nội dung', 'Kể câu chuyện của bạn.'], ['Khách mời', 'Những người đồng hành.'], ['Thư viện', 'Lưu giữ từng khoảnh khắc.'], ['Nhập Excel', 'Danh sách, gọn gàng hơn.'], ['Phản hồi', 'Một lời hẹn, thật gần.'], ['Lời chúc', 'Những lời thương mến.']]) {
    await navigate(page, name);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
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

test('real Excel invitations, private responses, moderation, link rotation and export', async ({ page, context }) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36).toUpperCase();
  const first = 'E2E' + suffix + 'A', second = 'E2E' + suffix + 'B';
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
  const guestPage = await context.newPage();
  await guestPage.goto(firstLink);
  await expect(guestPage.getByRole('heading', { name: guestName, exact: true })).toBeVisible();
  await guestPage.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await guestPage.setViewportSize({ width, height: 900 });
    expect(await guestPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await guestPage.getByRole('button', { name: 'Gửi xác nhận', exact: true }).click();
  await expect(guestPage.getByRole('status')).toContainText('Đã lưu lời hồi đáp');
  await guestPage.getByLabel('Lời chúc của bạn', { exact: true }).fill(wishText);
  await guestPage.getByLabel('Tôi đồng ý hiển thị tên và lời chúc').check();
  await guestPage.getByRole('button', { name: 'Gửi lời chúc', exact: true }).click();
  await expect(guestPage.getByText('Lời chúc đã được lưu và đang chờ duyệt. Cảm ơn bạn!', { exact: true })).toBeVisible();
  await guestPage.evaluate(path => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')); }, new URL(secondLink).pathname);
  await expect(guestPage.getByRole('heading', { name: otherName, exact: true })).toBeVisible();
  await expect(guestPage.getByText(guestName, { exact: true })).toHaveCount(0);
  expect(await guestPage.evaluate(() => localStorage.length)).toBe(0);
  await navigate(page, 'Lời chúc');
  const card = page.locator('.moderation-card').filter({ hasText: wishText });
  await card.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await expect(card).toHaveCount(0);
  await guestPage.goto(firstLink);
  await guestPage.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
  await expect(guestPage.locator('.wish-wall').getByText(wishText, { exact: true })).toBeVisible();
  await guestPage.getByLabel('Lời chúc của bạn', { exact: true }).fill(wishText + ' — đã chỉnh sửa');
  await guestPage.getByRole('button', { name: 'Gửi lời chúc', exact: true }).click();
  await expect(guestPage.getByText('Lời chúc đã được lưu và đang chờ duyệt. Cảm ơn bạn!', { exact: true })).toBeVisible();
  await guestPage.reload();
  await guestPage.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
  await expect(guestPage.locator('.wish-wall').getByText(wishText, { exact: true })).toHaveCount(0);
  await navigate(page, 'Khách mời');
  await page.getByRole('textbox', { name: 'Tìm khách mời' }).fill(first);
  await page.getByRole('button', { name: 'Lấy link ' + guestName, exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Cấp lại link', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await guestPage.reload();
  await expect(guestPage.getByRole('heading', { name: 'Chưa thể mở thiệp' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất Excel', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  const current = (await (await page.request.get(`/api/v1/admin/events/${event.id}/guests?q=${first}`)).json()).data.items[0];
  expect(current.invitation.rsvp.status).toBe('ATTENDING');
  expect(current.invitation.wish.body).toBe(wishText + ' — đã chỉnh sửa');
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
    await page.getByRole('button', { name: 'Công bố & tiếp nhận', exact: true }).click();
    await page.getByRole('button', { name: 'Công bố thiệp', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Vui lòng hoàn thiện nội dung');
  } finally {
    const current = (await (await page.request.get('/api/v1/admin/events/current')).json()).data;
    const restored = await page.request.patch(`/api/v1/admin/events/${before.id}/draft`, { headers: { 'X-CSRF-Token': me.csrfToken, 'If-Match': String(current.version), Origin: 'http://localhost:5173' }, data: { content: before.draft.contentJson } });
    expect(restored.ok()).toBe(true);
  }
});

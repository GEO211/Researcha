export default async function run(page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /staff login/i }).first().click();
  await page.locator('input[type="email"]').waitFor({ timeout: 15000 });
  await page.locator('input[type="email"]').fill('city@carelink.local');
  await page.locator('input[type="password"]').fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.getByRole('button', { name: /^referrals$/i }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: /^referrals$/i }).click();
  await page.getByRole('heading', { name: /all referrals/i }).waitFor({ timeout: 20000 });

  await page.getByRole('button', { name: /history/i }).click();
  await page.getByRole('heading', { name: /referral history/i }).waitFor({ timeout: 10000 });
  const historyText = await page.locator('body').innerText();

  await page.getByRole('button', { name: /send sms/i }).click();
  await page.getByRole('heading', { name: /manual sms/i }).waitFor({ timeout: 10000 });
  const smsText = await page.locator('body').innerText();

  return {
    historyVisible: /Referral history/i.test(historyText),
    historyHasRows: /CL-/.test(historyText),
    smsVisible: /Manual SMS/i.test(smsText),
    smsHasSelect: /Select referral/i.test(smsText),
  };
}

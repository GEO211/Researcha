export default async function run(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /staff login/i }).first().click();
  await page.getByRole('button', { name: /^patient$/i }).click();
  await page.getByPlaceholder(/referral \/ tracking code/i).fill('CL-20261005-P0526');
  await page.getByPlaceholder(/must match the patient record/i).fill('Presdemo TF');
  await page.getByRole('button', { name: /view my queue/i }).click();
  const menu = page.getByRole('button', { name: /open menu|menu/i }).first();
  if (await menu.count()) await menu.click().catch(() => {});
  await page.getByRole('button', { name: /ratings & feedback/i }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: /ratings & feedback/i }).click();
  await page.getByText(/your previous ratings/i).waitFor({ timeout: 15000 });
  const text = await page.locator('body').innerText();
  return {
    hasRated: /5\/5/i.test(text),
    hasView: /view rating/i.test(text),
    hasNav: /queue status|history|ratings & feedback|profile/i.test(text),
  };
}

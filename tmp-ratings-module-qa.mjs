export default async function run(page) {
  const result = {};
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });

  async function openStaffLogin() {
    const already = await page.getByRole('button', { name: /^patient$/i }).count();
    if (already) return;
    await page.getByRole('button', { name: /staff login/i }).first().click();
  }

  async function logoutIfVisible() {
    const logout = page.getByRole('button', { name: /log out/i });
    if (await logout.count()) await logout.click();
  }

  await openStaffLogin();
  await page.getByRole('button', { name: /^patient$/i }).click();
  await page.getByPlaceholder(/referral \/ tracking code/i).fill('CL-20261005-Y7C68D');
  await page.getByPlaceholder(/must match the patient record/i).fill('Ayco');
  await page.getByRole('button', { name: /view my queue/i }).click();
  await page.getByRole('button', { name: /ratings & feedback/i }).waitFor({ timeout: 25000 });
  result.louiseNav = await page.locator('aside nav').innerText();
  await page.getByRole('button', { name: /ratings & feedback/i }).click();
  await page.getByText(/awaiting your feedback/i).waitFor({ timeout: 15000 });
  result.louisePage = await page.locator('[class*="max-w-7xl"]').first().innerText();
  await logoutIfVisible();

  await openStaffLogin();
  await page.getByRole('button', { name: /^patient$/i }).click();
  await page.getByPlaceholder(/referral \/ tracking code/i).fill('CL-20261005-P0527');
  await page.getByPlaceholder(/must match the patient record/i).fill('Presdemo TG');
  await page.getByRole('button', { name: /view my queue/i }).click();
  await page.getByRole('button', { name: /ratings & feedback/i }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: /ratings & feedback/i }).click();
  await page.getByText(/your previous ratings/i).waitFor({ timeout: 15000 });
  result.ratedPage = await page.locator('[class*="max-w-7xl"]').first().innerText();
  const viewBtn = page.getByRole('button', { name: /view rating/i }).first();
  if (await viewBtn.count()) {
    await viewBtn.click();
    await page.waitForTimeout(500);
    result.viewModal = (await page.locator('body').innerText()).slice(0, 4000);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: /^history$/i }).click();
  await page.getByText(/visit history|medical visit/i).waitFor({ timeout: 15000 });
  result.historyPage = await page.locator('[class*="max-w-7xl"]').first().innerText();
  await logoutIfVisible();

  await openStaffLogin();
  await page.getByRole('button', { name: /^staff$/i }).click();
  await page.locator('input[type="email"]').fill('barangay@carelink.local');
  await page.locator('input[type="password"]').fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.getByRole('button', { name: /^queue$/i }).waitFor({ timeout: 25000 });
  result.barangayNav = await page.locator('aside nav').innerText();
  await logoutIfVisible();

  await openStaffLogin();
  await page.getByRole('button', { name: /^staff$/i }).click();
  await page.locator('input[type="email"]').fill('city@carelink.local');
  await page.locator('input[type="password"]').fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.getByRole('button', { name: /ratings & feedback/i }).waitFor({ timeout: 25000 });
  result.cityNav = await page.locator('aside nav').innerText();
  await page.getByRole('button', { name: /ratings & feedback/i }).click();
  await page.getByText('Average rating').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  result.cityRatings = await page.locator('[class*="max-w-7xl"]').first().innerText();
  const details = page.getByRole('button', { name: /view details/i }).first();
  if (await details.count()) {
    await details.click();
    await page.getByText(/patient feedback/i).waitFor({ timeout: 8000 });
    result.cityModal = (await page.locator('body').innerText()).slice(0, 5000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  const cityText = `${result.cityRatings || ''}\n${result.cityModal || ''}`;
  return {
    louiseHasRatingsNav: /ratings & feedback/i.test(result.louiseNav),
    louiseEmptyOrAwaiting: /all your completed visits have already been rated|rate now/i.test(result.louisePage),
    ratedShowsFeedback: /waiting time was too long|2\/5/i.test(`${result.ratedPage}\n${result.viewModal || ''}`),
    historyShowsRating: /2\/5|rating/i.test(result.historyPage),
    cityHasRatingsNav: /ratings & feedback/i.test(result.cityNav),
    cityHasSummary: /average rating/i.test(result.cityRatings) && /total ratings/i.test(result.cityRatings),
    citySeesFeedback: /waiting time was too long|needs attention|3\.5/i.test(cityText),
    barangayHasRatingsNav: /ratings & feedback/i.test(result.barangayNav),
    ok:
      /ratings & feedback/i.test(result.louiseNav)
      && /ratings & feedback/i.test(result.cityNav)
      && !/ratings & feedback/i.test(result.barangayNav)
      && /average rating/i.test(result.cityRatings)
      && /waiting time was too long|needs attention/i.test(cityText),
  };
}

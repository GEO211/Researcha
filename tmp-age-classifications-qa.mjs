function flags(page) {
  return page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')];
    const pick = (name) => {
      const label = labels.find((el) => el.textContent.trim() === name);
      const input = label?.querySelector('input[type="checkbox"]');
      return input ? { checked: input.checked, disabled: input.disabled } : null;
    };
    return {
      infant: pick('Infant'),
      child: pick('Child'),
      senior: pick('Senior citizen'),
      pwd: pick('PWD'),
    };
  });
}

export default async function run(page) {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /staff login/i }).first().click();
  await page.locator('input[type="email"]').waitFor({ timeout: 15000 });
  await page.locator('input[type="email"]').fill('barangay@carelink.local');
  await page.locator('input[type="password"]').fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.getByRole('button', { name: /^patients$/i }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: /^patients$/i }).click();
  await page.getByRole('heading', { name: /patient registration/i }).waitFor({ timeout: 20000 });

  const birth = page.locator('form input[type="date"]').first();
  await birth.waitFor({ timeout: 10000 });

  const empty = await flags(page);

  await birth.fill('2026-08-01');
  await page.waitForTimeout(200);
  const infant = await flags(page);

  await birth.fill('2015-01-01');
  await page.waitForTimeout(200);
  const child = await flags(page);

  await birth.fill('1950-06-15');
  await page.waitForTimeout(200);
  const senior = await flags(page);

  await birth.fill('1990-03-20');
  await page.waitForTimeout(200);
  const adult = await flags(page);

  return {
    empty,
    infant,
    child,
    senior,
    adult,
    ok:
      infant.infant?.checked === true && infant.child?.checked === false && infant.senior?.checked === false
      && child.infant?.checked === false && child.child?.checked === true && child.senior?.checked === false
      && senior.infant?.checked === false && senior.child?.checked === false && senior.senior?.checked === true
      && adult.infant?.checked === false && adult.child?.checked === false && adult.senior?.checked === false
      && infant.infant?.disabled === true && child.child?.disabled === true && senior.senior?.disabled === true
      && adult.pwd?.disabled === false,
  };
}

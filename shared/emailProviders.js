export const EMAIL_PROVIDER_MESSAGE = 'Use a real email address such as Gmail, Yahoo, or iCloud.';

const EXACT_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'rocketmail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'windowslive.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'zoho.com',
  'zohomail.com',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'email.com',
  'yandex.com',
  'yandex.ru',
  'fastmail.com',
  'fastmail.fm',
  'tuta.com',
  'tutanota.com',
  'tutamail.com',
  'hey.com',
  'pldt.com',
  'pldtdsl.net',
  'smart.com.ph',
  'globe.com.ph',
]);

const COUNTRY_MAIL = /^(yahoo|outlook|hotmail|live)\.(com|co\.[a-z]{2}|com\.[a-z]{2})$/;

export function isRecognizedEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const domain = email.slice(email.lastIndexOf('@') + 1);
  return EXACT_DOMAINS.has(domain) || COUNTRY_MAIL.test(domain);
}

export function createReferralCode() {
  const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE || 'Asia/Manila' })
    .format(new Date())
    .replaceAll('-', '');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CL-${stamp}-${random}`;
}

export function createQueueNumber(priorityLevel, countForDay) {
  const prefix = {
    priority_1_emergency: 'E',
    priority_2_vulnerable: 'V',
    priority_3_standard: 'S',
  }[priorityLevel] || 'Q';

  return `${prefix}-${String(countForDay + 1).padStart(3, '0')}`;
}

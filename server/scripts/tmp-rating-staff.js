const staffLogin = async (email) => {
  const res = await fetch('http://127.0.0.1:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const body = await res.json();
  return { status: res.status, token: body.token, role: body.user?.role };
};

const city = await staffLogin('city@carelink.local');
const barangay = await staffLogin('barangay@carelink.local');
const cityHeaders = { Authorization: `Bearer ${city.token}` };
const brgyHeaders = { Authorization: `Bearer ${barangay.token}` };

const list = await fetch('http://127.0.0.1:4000/api/ratings', { headers: cityHeaders });
const listBody = await list.json();
const summary = await fetch('http://127.0.0.1:4000/api/ratings/summary', { headers: cityHeaders });
const summaryBody = await summary.json();
const forbidden = await fetch('http://127.0.0.1:4000/api/ratings', { headers: brgyHeaders });
const forbiddenBody = await forbidden.json();
const patientRatings = await fetch('http://127.0.0.1:4000/api/ratings', {
  headers: { Authorization: 'Bearer fake' },
});

const first = listBody.ratings?.[0];
let patched = null;
if (first) {
  const patch = await fetch(`http://127.0.0.1:4000/api/ratings/${first.id}/status`, {
    method: 'PATCH',
    headers: { ...cityHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ internal_status: 'reviewed' }),
  });
  patched = { status: patch.status, body: await patch.json() };
}

console.log(JSON.stringify({
  cityRole: city.role,
  listStatus: list.status,
  count: listBody.ratings?.length,
  first: first && {
    visit: first.visit_number,
    rating: first.rating,
    comments: first.comments,
    patient_label: first.patient_label,
    hasEmail: Boolean(first.email),
    hasContact: Boolean(first.contact_number),
    internal_status: first.internal_status,
  },
  summary: summaryBody.summary && {
    total: summaryBody.summary.total,
    average: summaryBody.summary.average,
    needs_attention: summaryBody.summary.needs_attention,
    response_rate: summaryBody.summary.response_rate,
    by_service: summaryBody.summary.by_service,
  },
  barangayStatus: forbidden.status,
  barangayMessage: forbiddenBody.message,
  patientFake: patientRatings.status,
  patched: patched && { status: patched.status, internal_status: patched.body.rating?.internal_status, rating: patched.body.rating?.rating },
}, null, 2));

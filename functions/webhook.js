// POST /api/webhook  → receives Telegram button presses
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return new Response('OK');

  let update;
  try { update = await request.json(); }
  catch { return new Response('OK'); }

  const cb = update.callback_query;
  if (!cb || !cb.data) return new Response('OK');

  const [action, requestId] = cb.data.split(':');
  if (!requestId || !['approve', 'reject'].includes(action)) {
    return new Response('OK');
  }

  /* ---- Persist decision ---- */
  const status = action === 'approve' ? 'approved' : 'rejected';
  await env.STATUS_KV.put('req:' + requestId, status, { expirationTtl: 600 });

  /* ---- Answer callback (stops spinner on the button) ---- */
  await tg(env, 'answerCallbackQuery', {
    callback_query_id: cb.id,
    text: action === 'approve' ? '✅ Demande approuvée' : '❌ Demande rejetée',
    show_alert: false,
  });

  /* ---- Edit original message: append decision, remove buttons ---- */
  const original = cb.message?.text || '';
  const edited = `${original}\n\n<b>➡️ Décision :</b> ${
    action === 'approve' ? '✅ <b>APPROUVÉ</b>' : '❌ <b>REJETÉ</b>'
  }`;

  await tg(env, 'editMessageText', {
    chat_id: cb.message.chat.id,
    message_id: cb.message.message_id,
    text: edited,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [] },
  });

  return new Response('OK');
}

async function tg(env, method, payload) {
  return fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(err => { console.error('Telegram error:', err); });
}
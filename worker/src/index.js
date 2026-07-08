/* ══════════════════════════════════════════════════════════════
   Serenity Yachting Club — платіжний Worker (monobank Acquiring)
   ──────────────────────────────────────────────────────────────
   Тримає секретний токен мерчанта та створює рахунки в monobank.
   Клієнт (сайт) НІКОЛИ не бачить токен.

   Ендпоінти:
     POST /invoice        — створити рахунок { tourId } → { invoiceId, pageUrl }
     GET  /status         — статус рахунку ?invoiceId=... → { status, ... }
     POST /webhook        — колбек monobank про зміну статусу оплати

   Змінні середовища (Secrets/Vars):
     MONOBANK_TOKEN  (secret)  — токен інтернет-еквайрингу з web.monobank.ua
     SITE_URL        (var)     — адреса сайту (для повернення після оплати)
     SELF_URL        (var)     — публічна адреса цього Worker (для webHookUrl)
     ALLOWED_ORIGIN  (var)     — дозволене джерело CORS (адреса сайту)
   ══════════════════════════════════════════════════════════════ */

const MONO_API = 'https://api.monobank.ua';

// Джерело правди щодо сум передоплати (у копійках). Клієнт передає лише tourId,
// тож підмінити суму з браузера неможливо.
const TOURS = {
  cyclades: { title: 'Кіклади, Греція',                 deposit: 1_200_000 },
  amalfi:   { title: 'Амальфі та Капрі, Італія',        deposit: 1_500_000 },
  riviera:  { title: 'Лазурний берег і Корсика',        deposit: 1_800_000 },
  adriatic: { title: 'Адріатика, Хорватія',             deposit: 1_100_000 },
  bvi:      { title: 'Британські Віргінські острови',   deposit: 2_200_000 },
  turkey:   { title: 'Блакитний круїз, Туреччина',      deposit: 900_000 },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors(origin) });
    }

    try {
      if (url.pathname === '/invoice' && request.method === 'POST') {
        return await createInvoice(request, env, origin);
      }
      if (url.pathname === '/status' && request.method === 'GET') {
        return await invoiceStatus(url, env, origin);
      }
      if (url.pathname === '/webhook' && request.method === 'POST') {
        return await handleWebhook(request, env);
      }
      if (url.pathname === '/' ) {
        return json({ service: 'serenity-pay', ok: true }, 200, origin);
      }
      return json({ error: 'Not found' }, 404, origin);
    } catch (err) {
      return json({ error: err.message || 'Internal error' }, 500, origin);
    }
  },
};

/* ─── створення рахунку ─── */
async function createInvoice(request, env, origin) {
  if (!env.MONOBANK_TOKEN) {
    return json({ error: 'Платіжний сервіс ще не налаштовано' }, 503, origin);
  }
  const body = await request.json().catch(() => ({}));
  const tour = TOURS[body.tourId];
  if (!tour) return json({ error: 'Невідомий тур' }, 400, origin);

  const site = (env.SITE_URL || '').replace(/\/+$/, '');
  const self = (env.SELF_URL || '').replace(/\/+$/, '');
  const reference = 'serenity-' + crypto.randomUUID();

  const payload = {
    amount: tour.deposit,
    ccy: 980, // UAH
    merchantPaymInfo: {
      reference,
      destination: 'Передоплата бронювання: ' + tour.title,
      comment: 'Serenity Yachting Club',
    },
    redirectUrl: site ? site + '/payment-status.html' : undefined,
    webHookUrl: self ? self + '/webhook' : undefined,
    validity: 24 * 60 * 60,
    paymentType: 'debit',
  };

  const res = await fetch(MONO_API + '/api/merchant/invoice/create', {
    method: 'POST',
    headers: { 'X-Token': env.MONOBANK_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json({ error: data.errText || 'monobank відхилив запит' }, 502, origin);
  }
  return json({ invoiceId: data.invoiceId, pageUrl: data.pageUrl }, 200, origin);
}

/* ─── статус рахунку ─── */
async function invoiceStatus(url, env, origin) {
  if (!env.MONOBANK_TOKEN) return json({ error: 'not configured' }, 503, origin);
  const invoiceId = url.searchParams.get('invoiceId');
  if (!invoiceId) return json({ error: 'invoiceId is required' }, 400, origin);

  const res = await fetch(
    MONO_API + '/api/merchant/invoice/status?invoiceId=' + encodeURIComponent(invoiceId),
    { headers: { 'X-Token': env.MONOBANK_TOKEN } }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json({ error: data.errText || 'monobank error' }, 502, origin);

  // Повертаємо лише безпечний зріз даних.
  return json({
    invoiceId: data.invoiceId,
    status: data.status,
    amount: data.amount,
    ccy: data.ccy,
  }, 200, origin);
}

/* ─── webhook від monobank ─── */
async function handleWebhook(request, env) {
  const raw = await request.text();
  const sign = request.headers.get('X-Sign');

  // Перевіряємо підпис, якщо є токен (щоб приймати лише справжні колбеки monobank).
  if (env.MONOBANK_TOKEN) {
    const valid = await verifySignature(raw, sign, env.MONOBANK_TOKEN);
    if (!valid) return new Response('bad signature', { status: 400 });
  }

  let payload = {};
  try { payload = JSON.parse(raw); } catch (_) {}

  // Тут місце для вашої логіки виконання замовлення:
  //   payload.status === 'success' → підтвердити бронювання, надіслати лист тощо.
  // Наразі просто підтверджуємо отримання (200), щоб monobank не повторював запит.
  console.log('monobank webhook', payload.invoiceId, payload.status);

  return new Response('ok', { status: 200 });
}

/* ─── перевірка ECDSA-підпису webhook ─── */
async function verifySignature(body, signB64, token) {
  if (!signB64) return false;
  try {
    // Публічний ключ мерчанта (base64 від PEM).
    const res = await fetch(MONO_API + '/api/merchant/pubkey', { headers: { 'X-Token': token } });
    const { key } = await res.json();
    const pem = atob(key);
    const der = pemToDer(pem);

    const cryptoKey = await crypto.subtle.importKey(
      'spki', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
    );
    const sigDer = base64ToBytes(signB64);
    const sigRaw = derToRawSignature(sigDer); // SubtleCrypto очікує формат r||s
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, sigRaw, new TextEncoder().encode(body)
    );
  } catch (_) {
    return false;
  }
}

/* ─── helpers ─── */
function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin || '*') },
  });
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return base64ToBytes(b64);
}
// DER (0x30 … 0x02 r 0x02 s) → фіксовані 64 байти r||s для P-256.
function derToRawSignature(der) {
  let offset = 2; // пропускаємо 0x30 + довжину
  if (der[1] & 0x80) offset += der[1] & 0x7f; // довга форма довжини
  function readInt(pos) {
    if (der[pos] !== 0x02) throw new Error('bad DER');
    let len = der[pos + 1];
    let start = pos + 2;
    let bytes = der.slice(start, start + len);
    // прибираємо провідні нулі
    while (bytes.length > 32 && bytes[0] === 0x00) bytes = bytes.slice(1);
    const buf = new Uint8Array(32);
    buf.set(bytes, 32 - bytes.length);
    return { buf, next: start + len };
  }
  const r = readInt(offset);
  const s = readInt(r.next);
  const out = new Uint8Array(64);
  out.set(r.buf, 0);
  out.set(s.buf, 32);
  return out;
}

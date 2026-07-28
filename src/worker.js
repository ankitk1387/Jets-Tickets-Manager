export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/kv/')) {
      const key = decodeURIComponent(url.pathname.slice('/api/kv/'.length));

      if (request.method === 'GET') {
        const row = await env.DB.prepare('SELECT value FROM kv_store WHERE key = ?')
          .bind(key).first();
        if (!row) return json({ key, value: null }, 404);
        return json({ key, value: row.value }, 200);
      }

      if (request.method === 'PUT') {
        let body;
        try { body = await request.json(); }
        catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
        if (typeof body.value !== 'string') return json({ error: '"value" must be a string' }, 400);
        await env.DB.prepare(
          `INSERT INTO kv_store (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        ).bind(key, body.value).run();
        return json({ key, value: body.value, ok: true }, 200);
      }

      if (request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM kv_store WHERE key = ?').bind(key).run();
        return json({ key, deleted: true }, 200);
      }

      // Manual test hook: visit /api/notify-test?secret=<RESEND_API_KEY first few chars not needed>
      // Actually gated by a dedicated TEST_SECRET below.
      return json({ error: 'Method not allowed' }, 405);
    }

    if (url.pathname === '/api/notify-test') {
      // Lets you trigger a digest on demand from a browser, for testing.
      // Requires ?key=<TEST_TRIGGER_SECRET> to match the secret you set below.
      const provided = url.searchParams.get('key');
      if (!env.TEST_TRIGGER_SECRET || provided !== env.TEST_TRIGGER_SECRET) {
        return json({ error: 'Not authorized' }, 403);
      }
      const result = await sendDigestIfNeeded(env, { force: true });
      return json(result, 200);
    }

    // Anything that isn't an API route falls through to the static site
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDigestIfNeeded(env, { force: false }));
  },
};

async function sendDigestIfNeeded(env, { force }) {
  const lastRow = await env.DB.prepare('SELECT value FROM kv_store WHERE key = ?')
    .bind('last-notify-ts').first();
  const lastTs = lastRow ? parseInt(lastRow.value, 10) : 0;

  const gamesRow = await env.DB.prepare('SELECT value FROM kv_store WHERE key = ?')
    .bind('games').first();
  const games = gamesRow ? JSON.parse(gamesRow.value) : [];
  const gameById = {};
  games.forEach(g => { gameById[g.id] = g; });

  const respRows = await env.DB.prepare(
    "SELECT key, value FROM kv_store WHERE key LIKE 'responses:%'"
  ).all();

  const newEntries = [];
  for (const row of respRows.results) {
    const gameId = row.key.slice('responses:'.length);
    let responses;
    try { responses = JSON.parse(row.value); } catch (e) { continue; }
    for (const [name, r] of Object.entries(responses)) {
      if (r.ts > lastTs) {
        const g = gameById[gameId];
        newEntries.push({
          name,
          status: r.status,
          opponent: g ? g.opponent : gameId,
          date: g ? g.date : '',
        });
      }
    }
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO kv_store (key, value) VALUES ('last-notify-ts', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(String(now)).run();

  if (newEntries.length === 0 && !force) {
    return { sent: false, reason: 'no new responses' };
  }

  const statusLabel = (s) => (s === 'in' ? "I'm in" : s === 'maybe' ? 'Maybe' : s === 'out' ? "Can't go" : s);

  const lines = newEntries.length
    ? newEntries.map(e => `- ${e.name}: "${statusLabel(e.status)}" for vs ${e.opponent} (${e.date})`)
    : ['(No new responses — test trigger)'];

  const subject = newEntries.length
    ? `Gate Keeper: ${newEntries.length} new response${newEntries.length === 1 ? '' : 's'}`
    : 'Gate Keeper: test notification';

  const bodyText = `${subject}\n\n${lines.join('\n')}`;

  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) {
    return { sent: false, reason: 'RESEND_API_KEY or NOTIFY_EMAIL not set' };
  }

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.NOTIFY_FROM || 'Gate Keeper <notifications@arthurstickethub.com>',
      to: [env.NOTIFY_EMAIL],
      subject,
      text: bodyText,
    }),
  });

  return { sent: resendResp.ok, status: resendResp.status, entries: newEntries.length };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

      return json({ error: 'Method not allowed' }, 405);
    }

    // Anything that isn't /api/kv/... falls through to the static site
    return env.ASSETS.fetch(request);
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

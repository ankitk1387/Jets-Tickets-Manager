// Cloudflare Pages Function
// Handles /api/kv/:key  ->  backed by the D1 binding named "DB"
// This replaces the claude.ai-only window.storage API with a real database.

export async function onRequestGet(context) {
  const { params, env } = context;
  const key = params.key;

  const row = await env.DB.prepare('SELECT value FROM kv_store WHERE key = ?')
    .bind(key)
    .first();

  if (!row) {
    return json({ key, value: null }, 404);
  }
  return json({ key, value: row.value }, 200);
}

export async function onRequestPut(context) {
  const { params, env, request } = context;
  const key = params.key;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof body.value !== 'string') {
    return json({ error: '"value" must be a string' }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO kv_store (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(key, body.value).run();

  return json({ key, value: body.value, ok: true }, 200);
}

export async function onRequestDelete(context) {
  const { params, env } = context;
  const key = params.key;

  await env.DB.prepare('DELETE FROM kv_store WHERE key = ?').bind(key).run();
  return json({ key, deleted: true }, 200);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

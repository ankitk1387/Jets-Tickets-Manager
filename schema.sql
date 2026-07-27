-- Jets Gatekeeper — D1 schema
-- One simple key/value table. Mirrors the keys the app already uses:
--   roster, games, admin-pin, responses:<gameId>
CREATE TABLE IF NOT EXISTS kv_store (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

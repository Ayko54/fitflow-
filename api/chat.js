export const config = { api: { bodyParser: true } };

const SUPABASE_URL = 'https://cmsvgmvymlrfdhhvpuwt.supabase.co';
const DAILY_LIMIT = 10;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    const body = req.body;

    // Pexels proxy
    if (body.pexels_query) {
      const q = encodeURIComponent(body.pexels_query);
      const r = await fetch(
        `https://api.pexels.com/v1/search?query=${q}&per_page=1&orientation=square`,
        { headers: { Authorization: process.env.PEXELS_API_KEY } }
      );
      const d = await r.json();
      return res.status(200).json(d);
    }

    const { model, max_tokens, system, messages, user_id, check_limit } = body;

    // Chat limit kontrolü — backend'de yap
    if (user_id) {
      const today = new Date().toISOString().split('T')[0];
      const countResp = await fetch(
        `${SUPABASE_URL}/rest/v1/chat_logs?user_id=eq.${user_id}&log_date=eq.${today}&role=eq.user&select=id`,
        {
          headers: {
            apikey: process.env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          }
        }
      );
      const logs = await countResp.json();
      const msgCount = Array.isArray(logs) ? logs.length : 0;

      const profResp = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user_id}&select=extra_messages`,
        {
          headers: {
            apikey: process.env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          }
        }
      );
      const prof = await profResp.json();
      const extra = prof?.[0]?.extra_messages || 0;
      const total = DAILY_LIMIT + extra;

      if (msgCount >= total) {
        return res.status(429).json({
          error: 'LIMIT_EXCEEDED',
          message: `Günlük ${total} mesaj hakkın doldu!`,
          count: msgCount,
          limit: total
        });
      }

      if (check_limit) {
        return res.status(200).json({ count: msgCount, limit: total, ok: true });
      }
    }

    // Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
    });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

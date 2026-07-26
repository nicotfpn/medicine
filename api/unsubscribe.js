const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint' });
    }

    await kv.del(`sub:${endpoint}`);

    const subscribers = (await kv.get('subscribers')) || [];
    const updated = subscribers.filter((e) => e !== endpoint);
    await kv.set('subscribers', updated);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

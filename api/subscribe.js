const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const subscription = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }

    const key = `sub:${subscription.endpoint}`;
    await kv.set(key, JSON.stringify(subscription));

    const subscribers = (await kv.get('subscribers')) || [];
    if (!subscribers.includes(subscription.endpoint)) {
      subscribers.push(subscription.endpoint);
      await kv.set('subscribers', subscribers);
    }

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

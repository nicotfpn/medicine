const webpush = require('web-push');
const { kv } = require('@vercel/kv');

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    'mailto:admin@lembrete-remedios.app',
    vapidPublicKey,
    vapidPrivateKey
  );
}

function getCurrentTimeInBR() {
  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const h = String(brTime.getHours()).padStart(2, '0');
  const m = String(brTime.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  try {
    const currentHHMM = getCurrentTimeInBr();
    const subscribers = (await kv.get('subscribers')) || [];
    let sent = 0;
    let errors = 0;

    for (const endpoint of subscribers) {
      const subData = await kv.get(`sub:${endpoint}`);
      if (!subData) continue;

      const subscription = typeof subData === 'string' ? JSON.parse(subData) : subData;
      const remediosKey = `remedios:${endpoint}`;
      const remedios = (await kv.get(remediosKey)) || [];

      for (const remedio of remedios) {
        if (!remedio.horarios.includes(currentHHMM)) continue;

        const tag = `${remedio.id}:${currentHHMM}:${new Date().toISOString().slice(0, 10)}`;
        const sentKey = `sent:${endpoint}:${tag}`;
        const alreadySent = await kv.get(sentKey);
        if (alreadySent) continue;

        const payload = JSON.stringify({
          title: `Hora de tomar ${remedio.nome}!`,
          body: `São ${currentHHMM}. Não esqueça de tomar seu remédio.`,
          tag,
        });

        try {
          await webpush.sendNotification(subscription, payload);
          await kv.set(sentKey, true, { ex: 86400 });
          sent++;
        } catch (err) {
          console.error(`Push failed for ${endpoint}:`, err.message);
          errors++;

          if (err.statusCode === 410 || err.statusCode === 404) {
            await kv.del(`sub:${endpoint}`);
            const subs = (await kv.get('subscribers')) || [];
            await kv.set('subscribers', subs.filter((e) => e !== endpoint));
          }
        }
      }
    }

    return res.status(200).json({
      ok: true,
      time: currentHHMM,
      sent,
      errors,
      subscribers: subscribers.length,
    });
  } catch (err) {
    console.error('Check-schedules error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

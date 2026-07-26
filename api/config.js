module.exports = (req, res) => {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;

  if (!vapidPublicKey) {
    return res.status(500).json({ error: 'VAPID_PUBLIC_KEY not configured' });
  }

  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.status(200).json({ vapidPublicKey });
};

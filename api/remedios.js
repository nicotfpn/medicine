const { kv } = require('./_kv');

module.exports = async (req, res) => {
  const endpoint = req.query?.endpoint || req.body?.endpoint;

  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint identifier' });
  }

  const subKey = `sub:${endpoint}`;
  const subData = await kv.get(subKey);

  if (!subData) {
    return res.status(404).json({ error: 'Subscription not found' });
  }

  const remediosKey = `remedios:${endpoint}`;

  if (req.method === 'GET') {
    const remedios = (await kv.get(remediosKey)) || [];
    return res.status(200).json(remedios);
  }

  if (req.method === 'POST') {
    const { nome, horarios } = req.body;

    if (!nome || !Array.isArray(horarios) || horarios.length === 0) {
      return res.status(400).json({ error: 'Nome and horarios required' });
    }

    const remedios = (await kv.get(remediosKey)) || [];
    const novoRemedio = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      nome,
      horarios,
      criadoEm: new Date().toISOString()
    };
    remedios.push(novoRemedio);
    await kv.set(remediosKey, remedios);

    return res.status(201).json(novoRemedio);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Missing id' });
    }

    const remedios = (await kv.get(remediosKey)) || [];
    const filtered = remedios.filter((r) => r.id !== id);

    if (filtered.length === remedios.length) {
      return res.status(404).json({ error: 'Remedio not found' });
    }

    await kv.set(remediosKey, filtered);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

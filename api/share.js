// api/share.js — Vercel Serverless Function (CommonJS)
const { put, list } = require('@vercel/blob');

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      const id = Math.random().toString(36).substr(2, 10) + Date.now().toString(36);
      const blob = await put(`shares/${id}.json`, JSON.stringify(body), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });
      return res.status(200).json({ id, url: blob.url });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      const { blobs } = await list({ prefix: `shares/${id}.json` });
      if (!blobs.length) return res.status(404).json({ error: 'Not found' });
      const text = await fetch(blobs[0].url).then((r) => r.text());
      return res.status(200).json(JSON.parse(text));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

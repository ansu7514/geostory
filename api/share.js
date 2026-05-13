// api/share.js — Vercel Serverless Function
// POST /api/share  → { id }
// GET  /api/share?id=xxx → { rows, cols, ... }

import { put, get } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST — 데이터 저장
  if (req.method === 'POST') {
    try {
      const id = Math.random().toString(36).substr(2, 10) + Date.now().toString(36);
      const blob = await put(`shares/${id}.json`, JSON.stringify(req.body), {
        access: 'public',
        contentType: 'application/json',
      });
      return res.status(200).json({ id, url: blob.url });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET — 데이터 조회
  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      const blob = await get(`shares/${id}.json`);
      if (!blob) return res.status(404).json({ error: 'Not found' });
      const text = await fetch(blob.url).then(r => r.text());
      return res.status(200).json(JSON.parse(text));
    } catch (e) {
      return res.status(404).json({ error: 'Not found: ' + e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
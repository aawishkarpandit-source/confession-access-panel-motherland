// Vercel Serverless Function: POST /api/login — verifies the panel password.
// Password is set via Vercel env var ADMIN_PASSWORD (never shipped to the browser).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    res.status(500).json({ ok: false, error: 'ADMIN_PASSWORD is not set' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const provided = typeof body?.password === 'string' ? body.password : '';

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const match = a.length === b.length && timingSafeEqual(a, b);

  // Small artificial delay to slow brute force
  await new Promise((r) => setTimeout(r, 400));

  if (!match) {
    res.status(401).json({ ok: false, error: 'Wrong password' });
    return;
  }
  res.status(200).json({ ok: true });
}

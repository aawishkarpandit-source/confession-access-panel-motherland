// Vercel Serverless Function:
//   GET    /api/confessions  — list + decrypt (requires Authorization: Bearer <ADMIN_PASSWORD>)
//   DELETE /api/confessions?id=xxx — delete one (requires auth)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { isAuthorized, decrypt, getKey } from './_auth';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    if (!isAuthorized(req.headers.authorization)) {
      await new Promise((r) => setTimeout(r, 400));
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) throw new Error('Supabase env vars are not set');
    const supabase = createClient(supabaseUrl, serviceKey);
    const key = getKey();

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('confessions')
        .select('id, encrypted_data, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      const items = (data ?? []).map((row) => {
        let text = '[could not decrypt]';
        try {
          text = decrypt(row.encrypted_data, key);
        } catch {
          /* keep placeholder */
        }
        return { id: row.id, text, created_at: row.created_at };
      });
      res.status(200).json({ ok: true, items });
      return;
    }

    if (req.method === 'DELETE') {
      const id = typeof req.query.id === 'string' ? req.query.id : '';
      if (!id) {
        res.status(400).json({ ok: false, error: 'Missing id' });
        return;
      }
      const { error } = await supabase.from('confessions').delete().eq('id', id);
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('confessions api error', err);
    // TEMPORARY debug: surface the real message so the owner can diagnose.
    // Revert to a generic message once fixed.
    const detail = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ ok: false, error: `DEBUG: ${detail}` });
  }
}

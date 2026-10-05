// Vercel Serverless Function:
//   GET    /api/confessions  — list + decrypt (requires Authorization: Bearer <ADMIN_PASSWORD>)
//   DELETE /api/confessions?id=xxx — delete one (requires auth)
//
// NOTE: intentionally self-contained (no local imports) so a broken
// relative import can never crash the function outside the try/catch.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual, createDecipheriv } from 'node:crypto';

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) throw new Error('ENCRYPTION_SECRET is not set');
  const b64 = Buffer.from(secret, 'base64');
  if (b64.length === 32) return b64;
  const hex = Buffer.from(secret, 'hex');
  if (hex.length === 32) return hex;
  const raw = Buffer.from(secret, 'utf8');
  if (raw.length === 32) return raw;
  throw new Error('ENCRYPTION_SECRET must decode to 32 bytes');
}

function isAuthorized(authHeader: string | string[] | undefined): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error('ADMIN_PASSWORD is not set');
  if (typeof authHeader !== 'string') return false;
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return timingSafeEqual(a as unknown as any, b as unknown as any);
}

function decrypt(payload: string, key: Buffer): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Bad ciphertext format');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decipher = createDecipheriv('aes-256-gcm', key as unknown as any, iv as unknown as any);
  decipher.setAuthTag(tag as unknown as any);
  return Buffer.concat([
    Buffer.from(decipher.update(data as unknown as any)),
    Buffer.from(decipher.final())
  ]).toString('utf8');
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

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
    try {
      res.status(500).json({ ok: false, error: `DEBUG: ${detail}` });
    } catch {
      /* headers already sent — nothing more we can do */
    }
  }
}

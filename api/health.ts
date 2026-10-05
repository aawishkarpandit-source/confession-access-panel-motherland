// Vercel Serverless Function: GET /api/health
// Diagnostic only — reports WHETHER required env vars are set (never their values).
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  const secret = process.env.ENCRYPTION_SECRET;
  let secretBytes: number | null = null;
  if (secret) {
    const b64 = Buffer.from(secret, 'base64');
    secretBytes = b64.length; // must be 32
  }

  const checks = {
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    ENCRYPTION_SECRET: Boolean(secret),
    ENCRYPTION_SECRET_BYTES: secretBytes,
    ADMIN_PASSWORD: Boolean(process.env.ADMIN_PASSWORD)
  };

  const ok =
    checks.SUPABASE_URL &&
    checks.SUPABASE_SERVICE_ROLE_KEY &&
    secretBytes === 32 &&
    checks.ADMIN_PASSWORD;
  res.status(200).json({ ok, checks });
}

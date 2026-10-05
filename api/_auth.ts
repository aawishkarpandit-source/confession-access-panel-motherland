// Shared helpers for the access panel API (not a route itself)
import { timingSafeEqual, createDecipheriv } from 'node:crypto';

export function getAdminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error('ADMIN_PASSWORD is not set');
  return pw;
}

export function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) throw new Error('ENCRYPTION_SECRET is not set');
  try {
    const b64 = Buffer.from(secret, 'base64');
    if (b64.length === 32) return b64;
  } catch {
    /* ignore */
  }
  const hex = Buffer.from(secret, 'hex');
  if (hex.length === 32) return hex;
  const raw = Buffer.from(secret, 'utf8');
  if (raw.length === 32) return raw;
  throw new Error('ENCRYPTION_SECRET must decode to 32 bytes');
}

/** Constant-time password check. Expects `Authorization: Bearer <password>`. */
export function isAuthorized(authHeader: string | undefined): boolean {
  if (!authHeader) return false;
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(getAdminPassword());
  if (a.length !== b.length) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return timingSafeEqual(a as unknown as any, b as unknown as any);
}

/** Decrypts `iv:tag:ciphertext` (all base64) produced by AES-256-GCM. */
export function decrypt(payload: string, key: Buffer): string {
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

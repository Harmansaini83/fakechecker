import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const KEYS_DIR = path.resolve('keys');
const privPath = (id: string) => path.join(KEYS_DIR, `${id}.private.pem`);
const pubPath = (id: string) => path.join(KEYS_DIR, `${id}.public.pem`);

export function generateKeyPair(keyId: string) {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  if (fs.existsSync(privPath(keyId))) return;
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(privPath(keyId), privateKey.export({ type: 'pkcs8', format: 'pem' }));
  fs.writeFileSync(pubPath(keyId), publicKey.export({ type: 'spki', format: 'pem' }));
}

export function loadPrivateKey(keyId: string): crypto.KeyObject {
  return crypto.createPrivateKey(fs.readFileSync(privPath(keyId)));
}

export function loadPublicKey(keyId: string): crypto.KeyObject | null {
  if (!/^[a-z0-9]+$/i.test(keyId) || !fs.existsSync(pubPath(keyId))) return null;
  return crypto.createPublicKey(fs.readFileSync(pubPath(keyId)));
}

export function signPayload(payload: string, privateKey: crypto.KeyObject): string {
  return crypto.sign(null, Buffer.from(payload), privateKey).toString('base64url');
}

export function buildCode(keyId: string, publicId: string, privateKey: crypto.KeyObject): string {
  const payload = `FC1.${keyId}.${publicId}`;
  return `${payload}.${signPayload(payload, privateKey)}`;
}

export type ParsedCode = { keyId: string; publicId: string; signature: string; payload: string };

export function parseCode(code: string): ParsedCode | null {
  const parts = code.trim().split('.');
  if (parts.length !== 4 || parts[0] !== 'FC1') return null;
  return {
    keyId: parts[1],
    publicId: parts[2],
    signature: parts[3],
    payload: parts.slice(0, 3).join('.'),
  };
}

export function verifySignature(parsed: ParsedCode, publicKey: crypto.KeyObject): boolean {
  try {
    return crypto.verify(
      null,
      Buffer.from(parsed.payload),
      publicKey,
      Buffer.from(parsed.signature, 'base64url')
    );
  } catch {
    return false;
  }
}
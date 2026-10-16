import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? 'uploads');

// Trust file content, not the filename or the browser's claimed type.
export function sniff(b: Buffer): { ext: string; mime: string } | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.length > 8 && b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return { ext: 'png', mime: 'image/png' };
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP')
    return { ext: 'webp', mime: 'image/webp' };
  return null;
}

export async function saveFile(buf: Buffer, ext: string) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), buf);
  return name;
}

export const codeHash = (code: string) => crypto.createHash('sha256').update(code.trim()).digest('hex');
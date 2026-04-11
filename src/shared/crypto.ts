// Crypto helpers matching the iOS EncrytionAlgo.encryptAES256CBC + Util.bodyhash.
//
// Key:   32 UTF-8 bytes from env (not base64-decoded — used raw)
// IV:    16 UTF-8 bytes ("Brxd-7fAiRQFYz2e")
// Mode:  AES-256-CBC with PKCS7 padding
// Format: hex-encoded ciphertext

import crypto from 'node:crypto';
import { env } from '../config/env.js';

const KEY = Buffer.from(env.AES_KEY, 'utf8');
const IV = Buffer.from(env.AES_IV, 'utf8');
const SALT = env.AES_IV; // iOS uses the IV as the salt too

export function encryptAES256CBC(plaintext: string): string {
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, IV);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return encrypted.toString('hex');
}

export function decryptAES256CBC(hexCipher: string): string {
  if (!hexCipher || !/^[0-9a-fA-F]+$/.test(hexCipher) || hexCipher.length % 32 !== 0) {
    return hexCipher;
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, IV);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(hexCipher, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return hexCipher;
  }
}

export interface ModuleDataPayload {
  user_id: string;
  project_id: string;
  device_id: string;
  time_stamp: number;
}

/**
 * Decrypt a moduledata header and validate its structure + timestamp.
 * Returns the parsed payload on success, or null on any failure.
 */
export function decodeModuleData(hex: string): ModuleDataPayload | null {
  try {
    const json = decryptAES256CBC(hex);
    const parsed = JSON.parse(json) as ModuleDataPayload;
    if (
      typeof parsed.user_id !== 'string' ||
      typeof parsed.project_id !== 'string' ||
      typeof parsed.device_id !== 'string' ||
      typeof parsed.time_stamp !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function generateModuleData(
  userId: string,
  projectId: string,
  deviceId: string,
  timestamp: number = Date.now()
): string {
  const payload = JSON.stringify({
    user_id: userId,
    project_id: projectId,
    device_id: deviceId,
    time_stamp: timestamp,
  });
  return encryptAES256CBC(payload);
}

/**
 * Compute bodyhash matching iOS FCURLRequest:
 *   SHA-256({"payload":<body>,"moduledata":"<hex>"} + salt), hex-encoded.
 *
 * The virtual wrapper is NEVER sent as the HTTP body — it's only used for
 * the hash.
 */
export function generateBodyhash(requestBody: string, moduledataHex: string): string {
  const virtualBody = !requestBody
    ? `{"payload":"","moduledata":"${moduledataHex}"}`
    : `{"payload":${requestBody},"moduledata":"${moduledataHex}"}`;
  return crypto.createHash('sha256').update(virtualBody + SALT, 'utf8').digest('hex');
}

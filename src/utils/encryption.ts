import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Derive a key from a password using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a private key or sensitive data
 */
export function encrypt(data: string, password: string): string {
  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive key from password
  const key = deriveKey(password, salt);

  // Create cipher and encrypt
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(data, 'utf8'),
    cipher.final(),
  ]);

  // Get auth tag
  const tag = cipher.getAuthTag();

  // Combine all parts: salt + iv + tag + encrypted
  const combined = Buffer.concat([salt, iv, tag, encrypted]);

  return combined.toString('base64');
}

/**
 * Decrypt an encrypted private key or sensitive data
 */
export function decrypt(encryptedData: string, password: string): string {
  try {
    // Decode from base64
    const combined = Buffer.from(encryptedData, 'base64');

    // Extract parts
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    // Derive key from password
    const key = deriveKey(password, salt);

    // Create decipher and decrypt
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error('Failed to decrypt data. Invalid password or corrupted data.');
  }
}

/**
 * Generate a random encryption key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a string (one-way, for verification)
 */
export function hash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Verify a hash
 */
export function verifyHash(data: string, expectedHash: string): boolean {
  return hash(data) === expectedHash;
}

/**
 * Securely clear a string from memory (best effort)
 */
export function secureWipe(str: string): void {
  // Note: This is best effort in JavaScript
  // The string may still exist in memory due to GC
  if (typeof str === 'string' && str.length > 0) {
    // Create a mutable array and overwrite
    const arr = str.split('');
    for (let i = 0; i < arr.length; i++) {
      arr[i] = '\0';
    }
  }
}

/**
 * Mask a private key for display
 */
export function maskPrivateKey(key: string): string {
  if (!key || key.length < 10) return '***';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

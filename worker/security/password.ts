export const PASSWORD_ITERATIONS = 10_000;
const PREFIX = "pbkdf2-sha256";

function bytesToB64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function b64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
  return bytes;
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, iterations);
  return `${PREFIX}$${iterations}$${bytesToB64(salt)}$${bytesToB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterationsText, saltB64, hashB64] = stored.split("$");
  const iterations = Number(iterationsText);
  if (algorithm !== PREFIX || !Number.isInteger(iterations) || iterations < 1 || !saltB64 || !hashB64) {
    return false;
  }
  const actual = await derive(password, b64ToBytes(saltB64), iterations);
  const expected = b64ToBytes(hashB64);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < actual.length; index += 1) diff |= actual[index] ^ expected[index];
  return diff === 0;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

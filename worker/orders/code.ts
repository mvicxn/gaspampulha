const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePublicCode(random: Uint8Array = crypto.getRandomValues(new Uint8Array(8))): string {
  let code = "";
  for (const byte of random) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

export function isPublicCode(value: string): boolean {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(value);
}

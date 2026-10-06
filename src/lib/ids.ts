import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijkmnpqrstuvwxyz";

export function newId(prefix: string, size = 12) {
  const bytes = randomBytes(size);
  let out = "";
  for (let i = 0; i < size; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}_${out}`;
}

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function newApiKey() {
  const secret = randomBytes(24).toString("base64url");
  const key = `mk_live_${secret}`;
  return { key, hash: sha256(key), prefix: key.slice(0, 12) };
}

export const cents = (dollars: number) => Math.round(dollars * 100);
export const fmtMoney = (c: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(c / 100);

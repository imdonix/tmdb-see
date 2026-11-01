import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config";

const PREFIX = "enc:v1:";
let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;

  if (config.appSecret) {
    cachedKey = createHash("sha256").update(config.appSecret).digest();
    return cachedKey;
  }

  const keyPath = path.join(config.dataDir, "secret.key");
  if (existsSync(keyPath)) {
    cachedKey = readFileSync(keyPath);
    if (cachedKey.length !== 32) {
      throw new Error(`Invalid encryption key at ${keyPath}; expected 32 bytes`);
    }
    return cachedKey;
  }

  const key = randomBytes(32);
  writeFileSync(keyPath, key, { mode: 0o600 });
  cachedKey = key;
  return key;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptSecret(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (isEncrypted(value)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", loadKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string | null | undefined): string {
  if (value === undefined || value === null || value === "") return "";
  if (!isEncrypted(value)) return value;
  const body = value.slice(PREFIX.length);
  const [ivPart, tagPart, dataPart] = body.split(":");
  if (!ivPart || !tagPart || !dataPart) throw new Error("Malformed encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", loadKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value))!;
}

export function decryptJson<T>(value: string): T {
  return JSON.parse(decryptSecret(value)) as T;
}

export function makeCacheKey(parts: Array<string | number | undefined | null>): string {
  return createHash("sha256").update(parts.map((part) => String(part ?? "")).join("\u0000")).digest("hex");
}

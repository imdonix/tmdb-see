import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config";
import { keysMatch } from "./api-key";

const KEY_FILENAME = "api-key";

function loadOrCreateApiKey(): string {
  const fromEnv = config.apiKey.trim();
  if (fromEnv) return fromEnv;

  const file = path.join(config.dataDir, KEY_FILENAME);
  if (existsSync(file)) {
    const value = readFileSync(file, "utf8").trim();
    if (value) return value;
  }

  const value = randomBytes(24).toString("base64url");
  writeFileSync(file, `${value}\n`, { mode: 0o600 });
  return value;
}

export const apiKey = loadOrCreateApiKey();

export function isValidApiKey(candidate: string | null | undefined): boolean {
  return keysMatch(candidate, apiKey);
}

export { extractApiKey } from "./api-key";

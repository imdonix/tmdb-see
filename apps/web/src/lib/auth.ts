export const API_KEY_STORAGE = "see.apiKey";
export const AUTH_INVALID_EVENT = "see:auth-invalid";
export const AUTH_CHANGED_EVENT = "see:auth-changed";

export function getApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setApiKey(value: string): void {
  try {
    localStorage.setItem(API_KEY_STORAGE, value);
  } catch {
    // storage can be blocked; the in-memory flow still works for this request
  }
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function clearApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    // ignore
  }
}

export function logout(): void {
  clearApiKey();
  window.dispatchEvent(new Event(AUTH_INVALID_EVENT));
}

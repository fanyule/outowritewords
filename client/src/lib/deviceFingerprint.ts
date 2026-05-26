const DEVICE_FINGERPRINT_STORAGE_KEY = "ai-novel.device-fingerprint";

function generateDeviceFingerprint(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getBrowserDeviceFingerprint(): string {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return generateDeviceFingerprint();
  }

  const existing = window.localStorage.getItem(DEVICE_FINGERPRINT_STORAGE_KEY)?.trim();
  if (existing) {
    return existing;
  }

  const next = generateDeviceFingerprint();
  window.localStorage.setItem(DEVICE_FINGERPRINT_STORAGE_KEY, next);
  return next;
}

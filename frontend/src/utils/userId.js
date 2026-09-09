const STORAGE_KEY = 'chatbot_user_id';

// `crypto.randomUUID` only exists in secure contexts (HTTPS or localhost) —
// this deployment is served over plain http://ip:port, so it's unavailable
// there even though it works fine in local dev. Fall back to a manual
// RFC4122 v4 generator using `crypto.getRandomValues`, which has no such
// restriction, and finally to `Math.random` if even that is missing.
function generateUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOrCreateUserId() {
  let userId = localStorage.getItem(STORAGE_KEY);
  if (!userId) {
    userId = generateUuid();
    localStorage.setItem(STORAGE_KEY, userId);
  }
  return userId;
}

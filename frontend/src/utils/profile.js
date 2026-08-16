const STORAGE_KEY = 'chatbot_display_name';

export function getStoredDisplayName() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function setStoredDisplayName(name) {
  localStorage.setItem(STORAGE_KEY, name);
}

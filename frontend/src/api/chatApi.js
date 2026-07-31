import { API_BASE_URL } from '../config';

async function post(path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `Request to ${path} failed (${res.status})`);
  }
  return res.json();
}

export function startChat(userId) {
  return post('/chat/start', { userId });
}

export function sendMessage(userId, input) {
  return post('/chat/message', { userId, input });
}

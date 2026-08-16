import { API_BASE_URL } from '../config';

async function request(method, path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `Request to ${path} failed (${res.status})`);
  }
  return res.json();
}

export function startChat(userId, { displayName, clientHour, simulateNextDay } = {}) {
  return request('POST', '/chat/start', { userId, displayName, clientHour, simulateNextDay });
}

export function sendMessage(userId, input) {
  return request('POST', '/chat/message', { userId, input });
}

export function getProgress(userId) {
  return request('GET', `/progress?userId=${encodeURIComponent(userId)}`);
}

export function getSubTopicQa(moduleId, subTopicId) {
  return request('GET', `/modules/${encodeURIComponent(moduleId)}/subtopics/${encodeURIComponent(subTopicId)}/qa`);
}

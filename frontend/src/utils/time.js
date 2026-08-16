export function formatMinutesLeft(minutes) {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `~${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `~${hours}h ${mins}m left` : `~${hours}h left`;
}

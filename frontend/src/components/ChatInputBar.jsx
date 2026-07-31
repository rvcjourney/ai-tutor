import { useState } from 'react';

export default function ChatInputBar({ onSend, disabled }) {
  const [value, setValue] = useState('');

  function submit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    onSend(value);
    setValue('');
  }

  return (
    <form className="chat-input-bar" onSubmit={submit}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type your answer…"
        disabled={disabled}
        autoFocus
      />
      <button type="submit" className="send-btn" disabled={disabled || !value.trim()} aria-label="Send">
        ➤
      </button>
    </form>
  );
}

import { useState } from 'react';

export default function NamePrompt({ onSubmit }) {
  const [name, setName] = useState('');

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name);
  }

  return (
    <div className="name-prompt">
      <div className="bot-avatar large">CK</div>
      <h1>Welcome to AI Tutor</h1>
      <p>What should we call you?</p>
      <form onSubmit={submit}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoFocus
        />
        <button type="submit" disabled={!name.trim()}>
          Continue
        </button>
      </form>
    </div>
  );
}

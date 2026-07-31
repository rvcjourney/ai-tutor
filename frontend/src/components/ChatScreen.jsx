import { useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';
import MessageBubble from './MessageBubble';
import OptionButtons from './OptionButtons';
import ChatInputBar from './ChatInputBar';

export default function ChatScreen() {
  const { messages, options, inputType, loading, error, selectOption, sendText, retry } = useChat();
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, error]);

  return (
    <div className="chat-page">
      <div className="chat-screen">
        <header className="chat-header">
          <div className="bot-avatar">🎓</div>
          <div className="chat-header-text">
            <h1>AI Tutor</h1>
            <span className="chat-status">
              <span className="status-dot" />
              Online · Ready to help you learn
            </span>
          </div>
        </header>

        <div className="chat-messages">
          {messages.map((m) => (
            <MessageBubble key={m.id} sender={m.sender} text={m.text} />
          ))}

          {loading && (
            <div className="bubble-row bot">
              <div className="avatar bot-avatar-sm">🎓</div>
              <div className="bubble bot typing">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}

          {error && (
            <div className="bubble-row bot">
              <div className="avatar bot-avatar-sm">🎓</div>
              <div className="bubble bot error-bubble">
                <p>{error}</p>
                <button onClick={retry}>Retry</button>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="chat-footer">
          {inputType === 'options' && <OptionButtons options={options} onSelect={selectOption} disabled={loading} />}
          {inputType === 'text' && <ChatInputBar onSend={sendText} disabled={loading} />}
          {inputType === 'none' && !loading && !error && (
            <p className="chat-ended">✓ Conversation ended — reload to start again.</p>
          )}
        </div>
      </div>
    </div>
  );
}

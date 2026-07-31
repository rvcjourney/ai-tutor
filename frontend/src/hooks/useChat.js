import { useCallback, useEffect, useRef, useState } from 'react';
import * as chatApi from '../api/chatApi';
import { getOrCreateUserId } from '../utils/userId';

let nextMessageId = 1;

function makeMessage(sender, text) {
  return { id: nextMessageId++, sender, text };
}

export function useChat() {
  const userId = useRef(getOrCreateUserId()).current;
  const [messages, setMessages] = useState([]);
  const [options, setOptions] = useState([]);
  const [inputType, setInputType] = useState('none');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const lastActionRef = useRef({ type: 'start' });
  const hasStartedRef = useRef(false);

  const applyResponse = useCallback((response) => {
    setMessages((prev) => [...prev, makeMessage('bot', response.message)]);
    setOptions(response.options || []);
    setInputType(response.inputType || 'none');
  }, []);

  const runAction = useCallback(
    async (action, { learnerText, isRetry = false } = {}) => {
      setError(null);
      setLoading(true);
      lastActionRef.current = action;
      if (learnerText && !isRetry) {
        setMessages((prev) => [...prev, makeMessage('learner', learnerText)]);
      }
      try {
        const response =
          action.type === 'start' ? await chatApi.startChat(userId) : await chatApi.sendMessage(userId, action.input);
        applyResponse(response);
      } catch (err) {
        setError(err.message || 'Something went wrong. Is the backend running?');
      } finally {
        setLoading(false);
      }
    },
    [applyResponse, userId]
  );

  useEffect(() => {
    // Guards against React StrictMode's dev-only double-invoke of effects,
    // which would otherwise fire /chat/start twice and duplicate the greeting.
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    runAction({ type: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectOption = useCallback(
    (option) => {
      runAction({ type: 'message', input: option.id }, { learnerText: option.label });
    },
    [runAction]
  );

  const sendText = useCallback(
    (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      runAction({ type: 'message', input: trimmed }, { learnerText: trimmed });
    },
    [runAction]
  );

  const retry = useCallback(() => {
    runAction(lastActionRef.current, { isRetry: true });
  }, [runAction]);

  return { messages, options, inputType, loading, error, selectOption, sendText, retry };
}

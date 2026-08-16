import { useCallback, useEffect, useRef, useState } from 'react';
import * as chatApi from '../api/chatApi';
import { getOrCreateUserId } from '../utils/userId';
import { getStoredDisplayName, setStoredDisplayName } from '../utils/profile';

// Real network latency is often too fast to read as "the bot is thinking" — and
// too inconsistent to feel deliberate. Enforcing a minimum typing-indicator time
// (topped up, never added on top of, whatever the request actually took) makes
// every turn feel like a live reply instead of an instant screen swap.
const MIN_TYPING_MS = 550;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useAppState() {
  const userId = useRef(getOrCreateUserId()).current;
  const [displayName, setDisplayNameState] = useState(getStoredDisplayName);
  const [turn, setTurn] = useState(null); // { state, message, options, inputType }
  const [progress, setProgress] = useState(null); // { overallPercent, modules, displayName }
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState(null);
  // What the learner just tapped/typed, shown as their own sent-bubble above the
  // bot's next reply. Null on the very first turn (nothing tapped yet — just the
  // greeting) and cleared again whenever a menu screen with no prior tap is shown.
  const [lastUserMessage, setLastUserMessage] = useState(null);

  const hasStartedRef = useRef(false);
  const lastActionRef = useRef({ type: 'start' });

  const refreshProgress = useCallback(async () => {
    try {
      const p = await chatApi.getProgress(userId);
      setProgress(p);
    } catch {
      // Progress is supplementary (bars/percent) — don't blow up the whole screen if it fails.
    }
  }, [userId]);

  const runAction = useCallback(
    async (action, userLabel = null) => {
      setLoading(true);
      setTyping(true);
      setError(null);
      if (userLabel) setLastUserMessage(userLabel);
      lastActionRef.current = action;
      const startedAt = Date.now();
      try {
        const response =
          action.type === 'start'
            ? await chatApi.startChat(userId, {
                displayName: action.displayName,
                clientHour: new Date().getHours(),
              })
            : await chatApi.sendMessage(userId, action.input);
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_TYPING_MS) await wait(MIN_TYPING_MS - elapsed);
        setTurn(response);
        await refreshProgress();
      } catch (err) {
        setError(err.message || 'Something went wrong. Is the backend running?');
      } finally {
        setLoading(false);
        setTyping(false);
      }
    },
    [userId, refreshProgress]
  );

  useEffect(() => {
    // Guards against React StrictMode's dev-only double-invoke of effects.
    if (hasStartedRef.current) return;
    if (!displayName) return; // wait until the name prompt is submitted
    hasStartedRef.current = true;
    runAction({ type: 'start', displayName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName]);

  const submitName = useCallback((name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setStoredDisplayName(trimmed);
    setDisplayNameState(trimmed);
  }, []);

  const selectOption = useCallback(
    (option) => {
      runAction({ type: 'message', input: option.id }, option.label);
    },
    [runAction]
  );

  const sendText = useCallback(
    (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      runAction({ type: 'message', input: trimmed }, trimmed);
    },
    [runAction]
  );

  const retry = useCallback(() => {
    runAction(lastActionRef.current);
  }, [runAction]);

  // Used by the Q&A explorer's "Continue" button: the learner browsed the sub-topic's
  // questions in any order client-side (no backend calls per click), so this fires the
  // existing sequential 'next' a state at a time — same as clicking Next repeatedly —
  // until landing past the last fact card (first MCQ, or EXPLAIN_FURTHER if none).
  // Bypasses the per-turn typing delay: it's one "skip ahead" action, not a sequence of
  // conversational replies, so a single typing indicator covers the whole fast-forward.
  const skipToQuiz = useCallback(async () => {
    setLoading(true);
    setTyping(true);
    setError(null);
    setLastUserMessage('Continue ▸');
    lastActionRef.current = { type: 'message', input: 'next' };
    try {
      let response = await chatApi.sendMessage(userId, 'next');
      let guard = 0;
      while (response.screenType === 'fact' && guard < 50) {
        response = await chatApi.sendMessage(userId, 'next');
        guard += 1;
      }
      setTurn(response);
      await refreshProgress();
    } catch (err) {
      setError(err.message || 'Something went wrong. Is the backend running?');
    } finally {
      setLoading(false);
      setTyping(false);
    }
  }, [userId, refreshProgress]);

  return {
    displayName,
    submitName,
    turn,
    progress,
    loading,
    typing,
    lastUserMessage,
    error,
    selectOption,
    sendText,
    skipToQuiz,
    retry,
  };
}

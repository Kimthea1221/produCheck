// desktopfrontend/src/utils/useProcessing.js
// ADDED — shared processing overlay hook for async actions
import { useState, useRef, useEffect, useCallback } from 'react';

export function useProcessing() {
  const [state, setState] = useState({
    isVisible: false,
    title: '',
    message: '',
    status: 'loading', // 'loading' | 'success'
  });

  const busyRef = useRef(false);
  const isMountedRef = useRef(true);
  const shownAtRef = useRef(0);
  const delayTimerRef = useRef(null);
  const slowNoticeTimerRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
      if (slowNoticeTimerRef.current) clearTimeout(slowNoticeTimerRef.current);
    };
  }, []);

  const run = useCallback(async (options, asyncFn) => {
    // Double-submit protection
    if (busyRef.current) return false;
    busyRef.current = true;

    const {
      title = 'PROCESSING...',
      message = 'Please wait while we process your request...',
      successTitle = 'COMPLETE!',
      successMessage = 'Action completed successfully.',
      withSuccess = false,
    } = options || {};

    shownAtRef.current = 0;

    // Wait 200 ms before displaying overlay
    delayTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      shownAtRef.current = Date.now();
      setState({
        isVisible: true,
        title,
        message,
        status: 'loading',
      });

      // After 8 s visible, swap message to slow notice
      slowNoticeTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        setState((prev) => ({
          ...prev,
          message: 'This is taking longer than usual. Please keep the app open.',
        }));
      }, 8000);
    }, 200);

    let result = false;

    try {
      result = await asyncFn();
    } catch (err) {
      console.error('Processing error:', err);
      result = false;
    } finally {
      // Clear timers
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
      if (slowNoticeTimerRef.current) clearTimeout(slowNoticeTimerRef.current);

      const wasShown = shownAtRef.current > 0;

      if (wasShown) {
        // Enforce 500 ms minimum hold
        const elapsed = Date.now() - shownAtRef.current;
        if (elapsed < 500) {
          await new Promise((r) => setTimeout(r, 500 - elapsed));
        }

        // Show success state ONLY if result is true AND withSuccess is true
        if (result === true && withSuccess) {
          if (isMountedRef.current) {
            setState({
              isVisible: true,
              title: successTitle,
              message: successMessage,
              status: 'success',
            });
          }
          await new Promise((r) => setTimeout(r, 800));
        }
      }

      if (isMountedRef.current) {
        setState({
          isVisible: false,
          title: '',
          message: '',
          status: 'loading',
        });
      }

      busyRef.current = false;
    }

    return result === true;
  }, []);

  return {
    isVisible: state.isVisible,
    title: state.title,
    message: state.message,
    status: state.status,
    run,
  };
}

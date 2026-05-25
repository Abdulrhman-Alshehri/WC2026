import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

type TransitionPhase = 'idle' | 'exiting' | 'committing' | 'revealing';

interface UsePageTransitionArgs {
  currentPage: string;
  onCommitPage: (page: string) => void;
}

interface UsePageTransitionResult {
  isActive: boolean;
  isFastActive: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  navigateWithTransition: (targetPage: string) => void;
  handleVideoEnded: () => void;
  playOnce: (onComplete?: () => void) => void;
}

const START_GRACE_MS = 500;
const MAX_TIMEOUT_MS = 2200;
const DURATION_BUFFER_MS = 300;

export function usePageTransition({ currentPage, onCommitPage }: UsePageTransitionArgs): UsePageTransitionResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingPageRef = useRef<string | null>(null);
  const pendingCallbackRef = useRef<(() => void) | null>(null);
  const phaseRef = useRef<TransitionPhase>('idle');
  
  const [isActive, setIsActive] = useState(false);
  const [isFastActive, setIsFastActive] = useState(false);

  const startGuardRef = useRef<number | null>(null);
  const hardTimeoutRef = useRef<number | null>(null);
  const fastTimer1Ref = useRef<number | null>(null);
  const fastTimer2Ref = useRef<number | null>(null);

  const lastTransitionTimeRef = useRef<number>(0);
  const unmountedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (startGuardRef.current !== null) {
      window.clearTimeout(startGuardRef.current);
      startGuardRef.current = null;
    }
    if (hardTimeoutRef.current !== null) {
      window.clearTimeout(hardTimeoutRef.current);
      hardTimeoutRef.current = null;
    }
    if (fastTimer1Ref.current !== null) {
      window.clearTimeout(fastTimer1Ref.current);
      fastTimer1Ref.current = null;
    }
    if (fastTimer2Ref.current !== null) {
      window.clearTimeout(fastTimer2Ref.current);
      fastTimer2Ref.current = null;
    }
  }, []);

  const finalizeTransition = useCallback(() => {
    if (phaseRef.current === 'idle') return;

    clearTimers();
    phaseRef.current = 'committing';

    const pendingPage = pendingPageRef.current;
    pendingPageRef.current = null;
    const pendingCb = pendingCallbackRef.current;
    pendingCallbackRef.current = null;

    if (pendingPage) {
      flushSync(() => {
        onCommitPage(pendingPage);
      });
    } else if (pendingCb) {
      flushSync(() => {
        pendingCb();
      });
    }

    phaseRef.current = 'revealing';
    if (!unmountedRef.current) {
      setIsActive(false);
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }

    lastTransitionTimeRef.current = Date.now();
    phaseRef.current = 'idle';
  }, [clearTimers, onCommitPage]);

  const handleVideoEnded = useCallback(() => {
    finalizeTransition();
  }, [finalizeTransition]);

  // Shared playback engine used by both navigateWithTransition and playOnce
  const startPlayback = useCallback(() => {
    const video = videoRef.current;

    if (!video) {
      finalizeTransition();
      return;
    }

    video.currentTime = 0;
    const playPromise = video.play();

    startGuardRef.current = window.setTimeout(() => {
      if (phaseRef.current === 'exiting' && (video.paused || video.currentTime <= 0.01)) {
        finalizeTransition();
      }
    }, START_GRACE_MS);

    const durationMs = Number.isFinite(video.duration) && video.duration > 0
      ? Math.min((video.duration * 1000) + DURATION_BUFFER_MS, MAX_TIMEOUT_MS)
      : MAX_TIMEOUT_MS;

    hardTimeoutRef.current = window.setTimeout(() => {
      if (phaseRef.current !== 'idle') {
        finalizeTransition();
      }
    }, durationMs);

    if (playPromise !== undefined) {
      playPromise.catch(() => {
        finalizeTransition();
      });
    }
  }, [finalizeTransition]);

  const navigateWithTransition = useCallback((targetPage: string) => {
    if (targetPage === currentPage) return;
    if (phaseRef.current !== 'idle') return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onCommitPage(targetPage);
      return;
    }

    const now = Date.now();
    const timeSinceLastTransition = now - lastTransitionTimeRef.current;

    if (timeSinceLastTransition < 10000) {
      // Option B Snappy Path: Cooldown Active (< 10 seconds since last transition)
      phaseRef.current = 'exiting';
      setIsFastActive(true);

      // Step 1: Wait 100ms for the glassmorphic overlay to fade in/blur
      fastTimer1Ref.current = window.setTimeout(() => {
        if (unmountedRef.current) return;

        // Step 2: Swap the page DOM
        flushSync(() => {
          onCommitPage(targetPage);
        });

        // Step 3: Wait another 100ms to fade out the overlay and reset state
        fastTimer2Ref.current = window.setTimeout(() => {
          if (unmountedRef.current) return;
          setIsFastActive(false);
          phaseRef.current = 'idle';
          lastTransitionTimeRef.current = Date.now(); // Reset cooldown window
        }, 100);
      }, 100);

      return;
    }

    // Standard Path: Cooldown Expired (>= 10 seconds)
    pendingPageRef.current = targetPage;
    phaseRef.current = 'exiting';
    setIsActive(true);
    startPlayback();
  }, [currentPage, onCommitPage, startPlayback]);

  // Generic one-shot play: shows overlay, plays video, then runs onComplete.
  // Used for intro reveal and login transition. Silently skips if video not ready.
  const playOnce = useCallback((onComplete?: () => void) => {
    if (phaseRef.current !== 'idle') return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onComplete?.();
      return;
    }

    const video = videoRef.current;
    if (!video || video.readyState < 3) {
      onComplete?.();
      return;
    }

    pendingCallbackRef.current = onComplete ?? null;
    phaseRef.current = 'exiting';
    setIsActive(true);
    startPlayback();
  }, [startPlayback]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.load();
    }
  }, []);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      clearTimers();
      const video = videoRef.current;
      if (video) {
        video.pause();
      }
      pendingPageRef.current = null;
      pendingCallbackRef.current = null;
      phaseRef.current = 'idle';
    };
  }, [clearTimers]);

  return {
    isActive,
    isFastActive,
    videoRef,
    navigateWithTransition,
    handleVideoEnded,
    playOnce,
  };
}

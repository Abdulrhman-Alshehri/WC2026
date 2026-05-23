import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

type TransitionPhase = 'idle' | 'exiting' | 'committing' | 'revealing';

interface UsePageTransitionArgs {
  currentPage: string;
  onCommitPage: (page: string) => void;
}

interface UsePageTransitionResult {
  isActive: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  navigateWithTransition: (targetPage: string) => void;
  handleVideoEnded: () => void;
}

const START_GRACE_MS = 500;
const MAX_TIMEOUT_MS = 2200;
const DURATION_BUFFER_MS = 300;

export function usePageTransition({ currentPage, onCommitPage }: UsePageTransitionArgs): UsePageTransitionResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingPageRef = useRef<string | null>(null);
  const phaseRef = useRef<TransitionPhase>('idle');
  const [isActive, setIsActive] = useState(false);
  const startGuardRef = useRef<number | null>(null);
  const hardTimeoutRef = useRef<number | null>(null);
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
  }, []);

  const finalizeTransition = useCallback(() => {
    if (phaseRef.current === 'idle') return;

    clearTimers();
    phaseRef.current = 'committing';

    const pendingPage = pendingPageRef.current;
    pendingPageRef.current = null;

    if (pendingPage) {
      flushSync(() => {
        onCommitPage(pendingPage);
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

    phaseRef.current = 'idle';
  }, [clearTimers, onCommitPage]);

  const handleVideoEnded = useCallback(() => {
    finalizeTransition();
  }, [finalizeTransition]);

  const navigateWithTransition = useCallback((targetPage: string) => {
    if (targetPage === currentPage) return;
    if (phaseRef.current !== 'idle') return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onCommitPage(targetPage);
      return;
    }

    const video = videoRef.current;
    pendingPageRef.current = targetPage;
    phaseRef.current = 'exiting';
    setIsActive(true);

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
  }, [currentPage, finalizeTransition, onCommitPage]);

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
      phaseRef.current = 'idle';
    };
  }, [clearTimers]);

  return {
    isActive,
    videoRef,
    navigateWithTransition,
    handleVideoEnded,
  };
}

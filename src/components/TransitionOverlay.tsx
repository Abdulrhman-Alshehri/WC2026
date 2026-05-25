import { RefObject } from 'react';

interface TransitionOverlayProps {
  isActive: boolean;
  isFastActive: boolean;
  onEnded: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
}

export default function TransitionOverlay({ isActive, isFastActive, onEnded, videoRef }: TransitionOverlayProps) {
  return (
    <>
      <div
        id="transition-overlay"
        className={isActive ? 'active' : ''}
        aria-hidden="true"
      >
        <video
          ref={videoRef as RefObject<HTMLVideoElement>}
          muted
          playsInline
          preload="auto"
          onEnded={onEnded}
          controls={false}
          {...{ 'webkit-playsinline': 'true' }}
        >
          <source src="/assets/transition.mp4" type="video/mp4" />
        </video>
      </div>

      <div
        id="fast-transition-overlay"
        className={isFastActive ? 'active' : ''}
        aria-hidden="true"
      />
    </>
  );
}

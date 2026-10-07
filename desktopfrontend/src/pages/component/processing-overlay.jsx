// desktopfrontend/src/pages/component/processing-overlay.jsx
// ADDED — centered Processing loading overlay component
import { useEffect, useRef } from 'react';
import { Folder, Check } from 'lucide-react';

const OVERLAY_CSS = `/* desktopfrontend/src/pages/component/processing-overlay.css */
/* ADDED — scoped styling for unified Processing loading overlay */

.ProcOverlay {
  --proc-primary: #1D3439;
  --proc-tint: rgba(29, 52, 57, 0.08);
  --proc-title: #1D3439;
  --proc-text: #7a8796;
  --proc-card-bg: #FDFDFD;
  --proc-backdrop: rgba(3, 3, 3, 0.5);
  --proc-radius: 16px;
  --proc-shadow: 0 20px 50px rgba(0, 0, 0, 0.22);

  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background: var(--proc-backdrop);
  display: flex;
  justify-content: center;
  align-items: center;
  backdrop-filter: blur(2px);
  animation: ProcOverlayFadeIn 0.2s ease-out;
  font-family: inherit;
}

.ProcOverlayCard {
  background: var(--proc-card-bg);
  border-radius: var(--proc-radius);
  box-shadow: var(--proc-shadow);
  padding: 40px 32px;
  width: 380px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  outline: none;
  animation: ProcOverlayScaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: inherit;
}

.ProcOverlayIllustrationWrap {
  position: relative;
  width: 140px;
  height: 140px;
  margin-bottom: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.ProcOverlayCircle {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: var(--proc-tint);
  display: flex;
  justify-content: center;
  align-items: center;
}

.ProcOverlayRing {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: var(--proc-primary);
  animation: ProcOverlaySpin 1.2s linear infinite;
  pointer-events: none;
}

.ProcOverlayIconFolder {
  color: var(--proc-primary);
  animation: ProcOverlayBob 2s ease-in-out infinite;
}

.ProcOverlayIconCheck {
  color: var(--proc-primary);
  animation: ProcOverlayPop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.ProcOverlayTitle {
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--proc-title);
  margin: 0 0 8px 0;
}

.ProcOverlayLiveRegion {
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ProcOverlayMessage {
  font-family: inherit;
  font-size: 14px;
  color: var(--proc-text);
  margin: 0;
  line-height: 1.4;
  max-width: 280px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@keyframes ProcOverlaySpin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes ProcOverlayBob {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

@keyframes ProcOverlayPop {
  0% {
    transform: scale(0.7);
    opacity: 0;
  }
  100% {
    transform: scale(1);
  }
}

@keyframes ProcOverlayFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes ProcOverlayScaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ProcOverlayRing {
    animation: none;
    border: 3px solid var(--proc-primary);
    opacity: 0.4;
  }
  .ProcOverlayIconFolder,
  .ProcOverlayIconCheck,
  .ProcOverlay,
  .ProcOverlayCard {
    animation: none;
  }
}
`;

export default function ProcessingOverlay({
  isVisible,
  title = 'PROCESSING...',
  message = 'Please wait...',
  status = 'loading', // 'loading' | 'success'
  zIndex = 9000,
}) {
  const cardRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (isVisible) {
      previousFocusRef.current = document.activeElement;
      cardRef.current?.focus();
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus?.({ preventScroll: true });
      previousFocusRef.current = null;
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div
      className="ProcOverlay"
      style={{ zIndex }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{OVERLAY_CSS}</style>
      <div
        className="ProcOverlayCard"
        ref={cardRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-busy={status === 'loading'}
        aria-labelledby="procOverlayTitle"
        aria-describedby="procOverlayMessage"
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Tab') {
            e.preventDefault();
          }
        }}
      >
        <div className={`ProcOverlayIllustrationWrap ${status === 'success' ? 'success' : ''}`}>
          <div className="ProcOverlayCircle">
            {status === 'success' ? (
              <Check size={56} className="ProcOverlayIconCheck" />
            ) : (
              <Folder size={56} className="ProcOverlayIconFolder" />
            )}
          </div>
          {status === 'loading' && <div className="ProcOverlayRing" />}
        </div>

        <h3 id="procOverlayTitle" className="ProcOverlayTitle">
          {title}
        </h3>

        <div className="ProcOverlayLiveRegion" aria-live="polite">
          <p id="procOverlayMessage" className="ProcOverlayMessage">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

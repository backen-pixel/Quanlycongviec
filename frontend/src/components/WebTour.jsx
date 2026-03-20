import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════
// WebTour — Lightweight guided tour system (no external deps)
// Usage:
//   <TourButton tourId="dashboard" steps={dashboardSteps} />
//   <TourButton tourId="crm" steps={crmSteps} />
// ═══════════════════════════════════════════════════════════════════════

// Tooltip component — rendered via portal
function TourOverlay({ steps, currentStep, onNext, onPrev, onClose }) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [tooltipStyle, setTooltipStyle] = useState({});
  const tooltipRef = useRef(null);
  const step = steps[currentStep];

  const updatePosition = useCallback(() => {
    if (!step) return;
    
    // If step has no selector, show centered modal
    if (!step.selector) {
      setPos({ top: 0, left: 0, width: 0, height: 0, centered: true });
      setTooltipStyle({
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      });
      return;
    }

    const el = document.querySelector(step.selector);
    if (!el) {
      // Element not found — show centered
      setPos({ top: 0, left: 0, width: 0, height: 0, centered: true });
      setTooltipStyle({
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      });
      return;
    }

    const rect = el.getBoundingClientRect();
    const pad = 6;
    setPos({
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
      centered: false,
    });

    // Scroll into view
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Calculate tooltip position
    requestAnimationFrame(() => {
      if (!tooltipRef.current) return;
      const tt = tooltipRef.current.getBoundingClientRect();
      const placement = step.placement || 'bottom';
      const gap = 12;
      let style = { position: 'fixed' };

      if (placement === 'bottom') {
        style.top = rect.bottom + gap;
        style.left = Math.max(16, Math.min(rect.left + rect.width / 2 - tt.width / 2, window.innerWidth - tt.width - 16));
      } else if (placement === 'top') {
        style.top = rect.top - tt.height - gap;
        style.left = Math.max(16, Math.min(rect.left + rect.width / 2 - tt.width / 2, window.innerWidth - tt.width - 16));
      } else if (placement === 'right') {
        style.top = Math.max(16, rect.top + rect.height / 2 - tt.height / 2);
        style.left = rect.right + gap;
      } else if (placement === 'left') {
        style.top = Math.max(16, rect.top + rect.height / 2 - tt.height / 2);
        style.left = rect.left - tt.width - gap;
      }

      // Clamp to viewport
      if (style.top + tt.height > window.innerHeight - 16) {
        style.top = window.innerHeight - tt.height - 16;
      }
      if (style.top < 16) style.top = 16;
      if (style.left + tt.width > window.innerWidth - 16) {
        style.left = window.innerWidth - tt.width - 16;
      }
      if (style.left < 16) style.left = 16;

      setTooltipStyle(style);
    });
  }, [step, currentStep]);

  useEffect(() => {
    updatePosition();
    const timer = setTimeout(updatePosition, 100);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [updatePosition]);

  if (!step) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999]" onClick={onClose}>
      {/* Dark overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {!pos.centered && (
              <rect
                x={pos.left}
                y={pos.top}
                width={pos.width}
                height={pos.height}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%" 
          fill="rgba(0,0,0,0.5)" 
          mask="url(#tour-mask)"
          style={{ pointerEvents: 'all' }}
          onClick={onClose}
        />
      </svg>

      {/* Highlight ring */}
      {!pos.centered && (
        <div
          className="absolute border-2 border-blue-500 rounded-lg pointer-events-none"
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
            height: pos.height,
            boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.3)',
            transition: 'all 0.3s ease',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-sm w-full animate-fade-in"
        style={{ ...tooltipStyle, zIndex: 10000 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            {step.icon && <span className="text-xl">{step.icon}</span>}
            <h3 className="text-sm font-bold text-gray-900">{step.title}</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition cursor-pointer">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 pb-3">
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{step.content}</p>
          {step.tip && (
            <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700">💡 {step.tip}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 pb-4 pt-1 border-t border-gray-100">
          <span className="text-xs text-gray-400">{currentStep + 1} / {steps.length}</span>
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={onPrev}
                className="h-8 px-3 text-sm text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-1 cursor-pointer transition"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Trước
              </button>
            )}
            {currentStep < steps.length - 1 ? (
              <button
                onClick={onNext}
                className="h-8 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex items-center gap-1 cursor-pointer transition"
              >
                Tiếp <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="h-8 px-4 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 cursor-pointer transition"
              >
                ✓ Hoàn thành
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Help button + tour trigger
export function TourButton({ steps, className = '' }) {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const start = () => { setCurrentStep(0); setActive(true); };
  const close = () => setActive(false);
  const next = () => setCurrentStep(s => Math.min(s + 1, steps.length - 1));
  const prev = () => setCurrentStep(s => Math.max(s - 1, 0));

  // Keyboard
  useEffect(() => {
    if (!active) return;
    const handler = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active]);

  return (
    <>
      <button
        onClick={start}
        className={`h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-blue-600 transition cursor-pointer ${className}`}
        title="Hướng dẫn sử dụng"
      >
        <HelpCircle className="h-5 w-5" />
      </button>
      {active && (
        <TourOverlay
          steps={steps}
          currentStep={currentStep}
          onNext={next}
          onPrev={prev}
          onClose={close}
        />
      )}
    </>
  );
}

export default TourButton;

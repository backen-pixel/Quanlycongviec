import { createContext, useContext, useState, useCallback } from 'react';
import Joyride, { ACTIONS, EVENTS, STATUS } from 'react-joyride';
import { useNavigate, useLocation } from 'react-router-dom';

const TourContext = createContext();
export const useTour = () => useContext(TourContext);

// ═══════════════════════════════════════════════════════════════
// Custom tooltip — tiếng Việt, đẹp hơn mặc định
// ═══════════════════════════════════════════════════════════════
function TourTooltip({ continuous, index, step, size, backProps, closeProps, primaryProps, tooltipProps, isLastStep }) {
  return (
    <div {...tooltipProps} className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full overflow-hidden">
      {/* Header */}
      {step.title && (
        <div className="px-5 pt-4 pb-2 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            {step.icon && <span className="text-xl">{step.icon}</span>}
            {step.title}
          </h3>
        </div>
      )}
      {/* Body */}
      <div className="px-5 py-3">
        <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{step.content}</div>
        {step.tip && (
          <div className="mt-3 px-3 py-2 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700">💡 {step.tip}</p>
          </div>
        )}
      </div>
      {/* Footer */}
      <div className="flex items-center justify-between px-5 pb-4 pt-1">
        <span className="text-xs text-gray-400">{index + 1} / {size}</span>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button {...backProps} className="h-8 px-3 text-sm text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer transition">
              ← Trước
            </button>
          )}
          {continuous && !isLastStep ? (
            <button {...primaryProps} className="h-8 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 cursor-pointer transition">
              Tiếp →
            </button>
          ) : (
            <button {...closeProps} className="h-8 px-4 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 cursor-pointer transition">
              ✓ Xong
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Joyride styles override
// ═══════════════════════════════════════════════════════════════
const joyrideStyles = {
  options: {
    zIndex: 10000,
    arrowColor: '#fff',
    backgroundColor: '#fff',
    overlayColor: 'rgba(0, 0, 0, 0.5)',
    primaryColor: '#2563eb',
    textColor: '#374151',
  },
  spotlight: {
    borderRadius: 12,
  },
  overlay: {
    mixBlendMode: 'normal',
  },
};

// ═══════════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════════
export function TourProvider({ children }) {
  const [run, setRun] = useState(false);
  const [steps, setSteps] = useState([]);
  const [stepIndex, setStepIndex] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  const startTour = useCallback((tourSteps) => {
    setSteps(tourSteps);
    setStepIndex(0);
    setRun(true);
  }, []);

  const stopTour = useCallback(() => {
    setRun(false);
    setStepIndex(0);
  }, []);

  const handleCallback = useCallback((data) => {
    const { action, index, status, type, step } = data;

    // Tour finished or skipped
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      setRun(false);
      setStepIndex(0);
      return;
    }

    // Close button
    if (action === ACTIONS.CLOSE) {
      setRun(false);
      setStepIndex(0);
      return;
    }

    // Step change
    if (type === EVENTS.STEP_AFTER) {
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      const nextStep = steps[nextIndex];

      // If next step requires navigation to different page
      if (nextStep?.navigateTo && location.pathname !== nextStep.navigateTo) {
        setRun(false);
        navigate(nextStep.navigateTo);
        // Resume after navigation + render
        setTimeout(() => {
          setStepIndex(nextIndex);
          setRun(true);
        }, 600);
      } else {
        // If next step has a beforeStep action (click a tab, etc)
        if (nextStep?.beforeStep) {
          nextStep.beforeStep();
          setTimeout(() => setStepIndex(nextIndex), 300);
        } else {
          setStepIndex(nextIndex);
        }
      }
    }
  }, [steps, navigate, location.pathname]);

  return (
    <TourContext.Provider value={{ startTour, stopTour, run }}>
      {children}
      <Joyride
        run={run}
        steps={steps}
        stepIndex={stepIndex}
        continuous
        scrollToFirstStep
        showSkipButton={false}
        disableOverlayClose={false}
        disableCloseOnEsc={false}
        spotlightClicks={false}
        styles={joyrideStyles}
        tooltipComponent={TourTooltip}
        callback={handleCallback}
        floaterProps={{
          disableAnimation: false,
          styles: { floater: { filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.15))' } },
        }}
        locale={{
          back: 'Trước',
          close: 'Đóng',
          last: 'Xong',
          next: 'Tiếp',
          skip: 'Bỏ qua',
        }}
      />
    </TourContext.Provider>
  );
}

export default TourProvider;

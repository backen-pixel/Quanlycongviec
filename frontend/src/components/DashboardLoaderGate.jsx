/**
 * Island loader — progress RAF chỉ re-render component này, không re-render cả dashboard.
 */
import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { DashboardLoader } from './DashboardLoader';
import { createCrmLoadProgressController } from '../lib/crmDashboardLoadProgress';

export const DashboardLoaderGate = memo(forwardRef(function DashboardLoaderGate(
  {
    show = false,
    variant = 'crm',
    pipelineType = 'lead',
    companyName = '',
    className = '',
    tourId,
  },
  ref,
) {
  const [progress, setProgress] = useState(0);
  const ctrlRef = useRef(null);
  if (ctrlRef.current === null) {
    ctrlRef.current = createCrmLoadProgressController(setProgress);
  }

  useEffect(() => () => ctrlRef.current?.dispose(), []);

  useImperativeHandle(ref, () => ({
    start: () => ctrlRef.current?.start(),
    finish: (onDone) => ctrlRef.current?.finish(onDone),
    reset: () => ctrlRef.current?.reset(),
  }), []);

  if (!show) return null;

  return (
    <DashboardLoader
      variant={variant}
      progress={progress}
      pipelineType={pipelineType}
      companyName={companyName}
      className={className}
      tourId={tourId}
    />
  );
}));

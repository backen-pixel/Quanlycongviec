import { lazy, Suspense } from 'react';

const WorkshopTaskTemplatesPage = lazy(() => import('./WorkshopTaskTemplatesPage'));

export default function LogisticsTaskTemplatesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-3 border-orange-600 border-t-transparent rounded-full" /></div>}>
      <WorkshopTaskTemplatesPage initialArea="logistics" fixedArea="logistics" />
    </Suspense>
  );
}


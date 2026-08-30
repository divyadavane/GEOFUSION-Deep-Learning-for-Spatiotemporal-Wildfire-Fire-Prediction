import { Suspense } from 'react';
import { GridMap } from '@/components/GridMap';

export default function MapViewPage() {
  return (
    <div className="relative w-full h-[calc(100vh-4rem-3.5rem)] min-h-[650px] overflow-hidden">
      <Suspense
        fallback={
          <div className="w-full h-full bg-neutral-950 flex flex-col items-center justify-center text-xs font-mono text-neutral-400">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
            Initializing GeoFusion Map Engine...
          </div>
        }
      >
        <GridMap />
      </Suspense>
    </div>
  );
}

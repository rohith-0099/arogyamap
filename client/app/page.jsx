import dynamic from "next/dynamic";

// MapView must be client-only (Leaflet needs window)
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-dark-900">
      <div className="text-center">
        <div className="animate-spin w-10 h-10 border-2 border-urgency-high border-t-transparent rounded-full mx-auto mb-4" />
        <div className="text-gray-400">Loading ArogyaMap…</div>
      </div>
    </div>
  ),
});

export default function HomePage() {
  return <MapView />;
}

import Analytics from "@/components/Analytics";

export const metadata = {
  title: "Analytics — ArogyaMap",
  description: "Epidemic curves and district risk scores",
};

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen bg-dark-900">
      <Analytics />
    </div>
  );
}

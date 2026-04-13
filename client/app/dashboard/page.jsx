import Dashboard from "@/components/Dashboard";

export const metadata = {
  title: "ASHA Dashboard — ArogyaMap",
  description: "Community health worker zone overview and visit planning",
};

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-dark-900">
      <Dashboard />
    </div>
  );
}

import ReportForm from "@/components/ReportForm";

export const metadata = {
  title: "Report Symptoms — ArogyaMap",
  description: "Report your symptoms anonymously to help protect your community",
};

export default function ReportPage() {
  return (
    <div className="min-h-screen bg-dark-900">
      <ReportForm />
    </div>
  );
}

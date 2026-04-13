import { createClient } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";
import DashboardPage from "./DashboardPage";

export const metadata = {
  title: "ASHA Dashboard — ArogyaMap",
  description: "Community health worker zone overview and visit planning",
};

export default async function Page() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, zone_name, district")
    .eq("id", user.id)
    .single();

  const role = profile?.role || "asha_worker";
  const zone = profile?.zone_name || null;
  const district = profile?.district || null;

  return (
    <div className="min-h-screen bg-dark-900">
      <DashboardPage role={role} zone={zone} district={district} userEmail={user.email} />
    </div>
  );
}

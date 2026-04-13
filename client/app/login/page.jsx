import { createClient } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const supabase = createClient();
  
  // Use getUser() for security as it re-verifies the session with Supabase
  const { data: { user } } = await supabase.auth.getUser();

  // If already logged in, redirect immediately before rendering the form
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role === "asha_worker") {
      redirect("/dashboard");
    } else if (profile?.role === "admin") {
      redirect("/analytics");
    } else {
      redirect("/");
    }
  }

  // If no user, render the client-side login form
  return <LoginForm />;
}

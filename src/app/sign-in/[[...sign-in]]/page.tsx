import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export default async function SignInPage() {
  if (await getCurrentAccount()) redirect("/dashboard");
  return <LoginForm />;
}

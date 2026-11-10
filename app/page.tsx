import { BillsDashboard } from "@/components/bills/bills-dashboard";
import { LoginScreen } from "@/components/auth/login-screen";
import { getAuthenticatedSession } from "@/lib/auth";
import { activeStewardContext, mayManageBills } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ refusal?: string }> }) {
  const authentication = await getAuthenticatedSession();

  if (!authentication.session) {
    if (authentication.shouldClearCookie) {
      const code = authentication.refusalCode ? `?code=${encodeURIComponent(authentication.refusalCode)}` : "";
      redirect(`/auth/session-ended${code}`);
    }

    const { refusal } = await searchParams;
    return <LoginScreen refusalCode={refusal} />;
  }

  const context = activeStewardContext(authentication.session);
  return <BillsDashboard canManage={mayManageBills(context.role)} personName={authentication.session.check.name} />;
}

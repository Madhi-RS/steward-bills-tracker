import { NextResponse } from "next/server";

import { activeStewardContext, mayManageBills, requireAuthenticatedRequest, unauthenticatedResponse } from "@/lib/auth";
import { getStewardCore } from "@/lib/steward";

export async function GET(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.session) return unauthenticatedResponse(authentication);

  const context = activeStewardContext(authentication.session);
  if (!mayManageBills(context.role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Only a Steward owner or admin can assign bill tasks." } }, { status: 403 });
  }

  try {
    const core = getStewardCore();
    const [people, units] = await Promise.all([
      core.people(context.businessId, context.viewerToken),
      core.units(context.businessId, context.viewerToken),
    ]);
    const companies = [...new Set(units.units.map((unit) => unit.company))];

    return NextResponse.json({
      data: {
        people: people.people.filter((person) => person.id !== context.personId),
        companies,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Steward's directory could not be loaded.";
    return NextResponse.json({ error: { code: "STEWARD_ERROR", message } }, { status: 502 });
  }
}

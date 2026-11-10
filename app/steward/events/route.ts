import { stewardHandlers } from "@pente-ai-inc/module-sdk";

import { handleStewardEvent } from "@/lib/steward-events";
import { getStewardEventReceiver } from "@/lib/steward";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return stewardHandlers(getStewardEventReceiver(), { onEvent: handleStewardEvent }).events(request);
}

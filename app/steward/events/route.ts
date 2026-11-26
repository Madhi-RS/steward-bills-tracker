import { stewardHandlers } from "@pente-ai-inc/module-sdk";

import { handleStewardEvent } from "@/lib/steward-events";
import { getStewardEventReceiver } from "@/lib/steward";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return stewardHandlers(getStewardEventReceiver(), {
    onEvent: async (event) => {
      try {
        await handleStewardEvent(event);
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined;
        console.error("[steward-bills-tracker] event handler failed", {
          eventId: event.id,
          eventType: event.type,
          code,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }).events(request);
}

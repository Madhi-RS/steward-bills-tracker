import { z } from "zod";

export const healthCheckResponseSchema = z.object({
  status: z.literal("ok"),
});

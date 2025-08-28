import { z } from "zod";

const configSchema = z.object({
  DATA_PATH: z.string(),
  AUTH_TOKEN: z
    .string()
    .min(10, "AUTH_TOKEN must be at least 10 characters long"),
});

export default configSchema.parse(process.env);

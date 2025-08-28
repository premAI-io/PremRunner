import { z } from "zod";

const configSchema = z.object({
  DATA_PATH: z.string(),
});

export default configSchema.parse(process.env);

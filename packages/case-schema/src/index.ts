import { z } from "zod";

// Placeholder: the full case pack schema lands in NEO-10.
export const CaseMetaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  language: z.string().min(2),
  players: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
});

export type CaseMeta = z.infer<typeof CaseMetaSchema>;

import { z } from 'zod';

export const skillName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const skillInfoSchema = z.object({
  id: z.string().uuid(),
  name: skillName,
  description: z.string().trim().min(1).max(1024),
  manualOnly: z.boolean(),
  enabled: z.boolean(),
  importedAt: z.number(),
});
export type SkillInfo = z.infer<typeof skillInfoSchema>;
export function skillCommand(text: string) {
  const match = /^\/(?:skill:)?([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+([\s\S]*))?$/.exec(text.trim());
  return match ? { name: match[1], arguments: match[2] ?? '' } : null;
}

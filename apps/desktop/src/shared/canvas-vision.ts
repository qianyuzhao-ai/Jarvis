import { z } from 'zod';
export const visionAssetInfoSchema = z
  .object({
    nodeId: z.string().min(1).max(100),
    name: z.string().max(200),
    kind: z.enum(['image', 'video-frame']),
    time: z.number().finite().nonnegative().optional(),
    preview: z
      .string()
      .max(100000)
      .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
  })
  .strict();
export const visionAssetSchema = visionAssetInfoSchema
  .extend({
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    data: z
      .string()
      .min(4)
      .max(2800000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export type VisionAssetInfo = z.infer<typeof visionAssetInfoSchema>;
export type VisionAsset = z.infer<typeof visionAssetSchema>;

import { z } from 'zod';

export const canvasNodeIdSchema = z.string().min(1).max(100);

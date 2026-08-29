import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const docs = defineCollection({
  loader: glob({
    base: './docs/content',
    pattern: '**/*.{md,mdx}',
  }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    locale: z.enum(['en', 'ru', 'zh', 'ko']),
    section: z.enum(['start', 'learn', 'reference']),
    navTitle: z.string(),
    order: z.number().int().nonnegative(),
  }),
});

export const collections = { docs };

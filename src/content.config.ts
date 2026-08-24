import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    keywords: z.array(z.string()),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    readingTime: z.number(),
    author: z.string().default('RoamDawn Editorial Team'),
    tags: z.array(z.string()),
    draft: z.boolean().default(false),
    featuredImage: z.string()
  })
});

export const collections = { blog };

import { randomInt } from "node:crypto";

export function generateSlug(): string {
  let slug: string;
  do {
    slug = randomInt(36 ** 8).toString(36).padStart(8, "0");
    // Reserve entirely numeric paths for links to posts made before slugs.
  } while (/^\d+$/.test(slug));
  return slug;
}

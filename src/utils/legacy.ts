import { getLegacyPaste } from "./database";

export function redirectLegacyPaste(req: Request, identifier: string, prefix = ""): Response | null {
  if (!/^[1-9]\d*$/.test(identifier)) return null;
  const paste = getLegacyPaste(identifier);
  if (!paste) return null;
  const target = new URL(req.url);
  target.pathname = `${prefix}/${paste.slug}`;
  return new Response(null, {
    status: 308,
    headers: {
      Location: target.pathname + target.search,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

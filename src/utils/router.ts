import create from "../routes/create";
import raw from "../routes/raw";

export default function router(req: Request) {
  const url = new URL(req.url);
  if (url.pathname === "/create") return create(req);
  if (url.pathname.startsWith("/raw/")) return raw(req);

  return new Response("404: Page not found.", { status: 404 });
}

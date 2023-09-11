import create from "../routes/create";

export default function router(req: Request) {
  const url = new URL(req.url);
  if (url.pathname === "/create") return create(req);

  return new Response("404: Page not found.", { status: 404 });
}

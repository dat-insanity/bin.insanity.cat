import create from "../routes/create";
import raw from "../routes/raw";
import index from "../routes/index";
import view from "../routes/view";
import title from "../routes/title";

export default function router(req: Request) {
  const url = new URL(req.url);
  if (url.pathname === "/create") return create(req);
  if (url.pathname.startsWith("/raw/title/")) return title(req);
  if (url.pathname.startsWith("/raw/")) return raw(req);
  if (url.pathname === "/") return index(req);
  if (url.pathname.split("/").length == 2 && url.pathname.split("/")[1] !== "")
    return view(req);

  return new Response("404: Page not found.", { status: 404 });
}

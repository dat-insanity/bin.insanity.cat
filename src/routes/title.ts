import * as database from "../utils/database";
import { redirectLegacyPaste } from "../utils/legacy";

export default async function paste(req: Request) {
  try {
    if (req.method != "GET")
      return new Response("Method Not Allowed", { status: 405 });

    const url = new URL(req.url);
    const match = url.pathname.match(/^\/raw\/title\/([a-z0-9]{8}|[1-9]\d*)$/);
    if (match) {
      const title = database.getTitle(match[1]);
      if (title !== null) return new Response(title, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
      const redirect = redirectLegacyPaste(req, match[1], "/raw/title");
      if (redirect) return redirect;
    }

    return new Response("404: Page not found.", { status: 404 });
  } catch (err) {
    console.error(err);
    return new Response("Bad request", { status: 400 });
  }
}

import * as database from "../utils/database";
import { redirectLegacyPaste } from "../utils/legacy";

export default async function paste(req: Request) {
  try {
    if (req.method != "GET")
      return new Response("Method Not Allowed", { status: 405 });

    const url = new URL(req.url);
    const match = url.pathname.match(/^\/raw\/([a-z0-9]{8}|[1-9]\d*)$/);
    if (match) {
      const text = database.getText(match[1]);
      if (text !== null) return new Response(text, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
      const redirect = redirectLegacyPaste(req, match[1], "/raw");
      if (redirect) return redirect;
    }

    return new Response("404: Page not found.", { status: 404 });
  } catch (err) {
    console.error(err);
    return new Response("Bad request", { status: 400 });
  }
}

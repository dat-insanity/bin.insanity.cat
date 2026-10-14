import * as database from "../utils/database";

export default async function paste(req: Request) {
  try {
    if (req.method != "GET")
      return new Response("Method Not Allowed", { status: 405 });

    const url = new URL(req.url);
    const match = url.pathname.match(/^\/raw\/([1-9]\d*)$/);
    if (match) {
      const text = database.getText(match[1]);
      if (text !== null) return new Response(text, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    return new Response("404: Page not found.", { status: 404 });
  } catch (err) {
    console.error(err);
    return new Response("Bad request", { status: 400 });
  }
}

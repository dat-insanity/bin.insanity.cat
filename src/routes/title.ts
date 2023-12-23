import * as database from "../utils/database";

export default async function paste(req: Request) {
  try {
    if (req.method != "GET")
      return new Response("Method Not Allowed", { status: 405 });

    const url = new URL(req.url);
    const urlPath = url.pathname.split("/");

    if (urlPath.length > 4) {
      return new Response("404: Page not found.", { status: 404 });
    }

    if (urlPath[3] && Number.isInteger(parseInt(urlPath[3]))) {
      return new Response(database.getTitle(urlPath[3]));
    }

    return new Response("404: Page not found.", { status: 404 });
  } catch (err) {
    console.error(err);
    return new Response("Bad request", { status: 400 });
  }
}

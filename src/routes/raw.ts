export default async function paste(req: Request) {
  try {
    if (req.method != "GET")
      return new Response("Method Not Allowed", { status: 405 });

    const url = new URL(req.url);

    if (url.pathname.split("/").length > 3) {
      return new Response("404: Page not found.", { status: 404 });
    }

    if (url.pathname.split("/")[2]) {
      console.log(url.pathname.split("/")[2]);
      return new Response(atob(url.pathname.split("/")[2]));
    }

    return new Response("404: Page not found.", { status: 404 });
  } catch (err) {
    console.error(err);
    return new Response("Bad request", { status: 400 });
  }
}

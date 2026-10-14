import * as database from "../utils/database";

export default async function create(req: Request) {
  if (req.method != "POST")
    return new Response("Method Not Allowed", { status: 405 });

  let json;
  try {
    json = await req.json();
  } catch (e) {
    return new Response("Bad Request", { status: 400 });
  }

  if (
    !json ||
    typeof json.text !== "string" ||
    !json.text ||
    (json.title !== undefined && typeof json.title !== "string")
  ) return new Response("Invalid request.", { status: 400 });

  try {
    const { slug, editKey } = database.writeText(json.text, json.title ?? "");
    const origin = Bun.env.SERVER_URL
      ? `${Bun.env.PROTOCOL || "http"}://${Bun.env.SERVER_URL}`
      : new URL(req.url).origin;
    const url = new URL(`/${slug}`, origin);
    url.searchParams.set("EDIT", editKey);
    return new Response(url.toString(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(err);
    return new Response("Internal server error.", { status: 500 });
  }
}

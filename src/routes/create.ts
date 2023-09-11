export default async function create(req: Request) {
  if (req.method != "POST")
    return new Response("Method Not Allowed", { status: 405 });

  let json;
  try {
    json = await req.json();
  } catch (e) {
    return new Response("Bad Request", { status: 400 });
  }

  if (!json.text) return new Response("Invalid request.", { status: 200 });

  return new Response(
    JSON.stringify({
      text: `${Bun.env.PROTOCOL}://${Bun.env.SERVER_URL}/${btoa(json.text)}`,
    })
  );
}

import * as database from "../utils/database";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

function metadata(paste: database.Paste, publicUrl: string): string {
  const title = paste.title?.trim() ? paste.title : "bin.insanity.cat";
  let characterCount = 0;
  for (const _ of segmenter.segment(paste.text)) characterCount++;
  const properties = [
    ["og:type", "article"],
    ["og:title", title],
    ["og:description", paste.text],
    ["og:site_name", `${characterCount} ${characterCount === 1 ? "character" : "characters"}`],
    ["og:url", publicUrl],
  ];
  if (paste.created_at) properties.push(["article:published_time", paste.created_at]);

  return [
    `<title>${escapeHtml(title)}</title>`,
    `<link rel="canonical" href="${escapeHtml(publicUrl)}" />`,
    `<meta name="description" content="${escapeHtml(paste.text)}" />`,
    ...properties.map(([property, content]) =>
      `<meta property="${property}" content="${escapeHtml(content)}" />`
    ),
  ].join("\n    ");
}

export default async function view(req: Request) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };

  if (!["GET", "PUT", "DELETE"].includes(req.method)) {
    return new Response("Method Not Allowed", {
      status: 405, headers: { ...headers, Allow: "GET, PUT, DELETE" },
    });
  }

  try {
    const url = new URL(req.url);
    const id = url.pathname.slice(1);
    const paste = database.getPaste(id);
    if (!paste) return new Response("404: Page not found.", { status: 404, headers });

    const editKey = url.searchParams.get("EDIT");
    const editable = database.canEdit(id, editKey);
    if (req.method === "GET") {
      const template = await Bun.file(
        editable ? "./src/public/edit.html" : "./src/public/view.html"
      ).text();
      const origin = Bun.env.SERVER_URL
        ? `${Bun.env.PROTOCOL || "http"}://${Bun.env.SERVER_URL}`
        : url.origin;
      const publicUrl = new URL(`/${paste.id}`, origin).toString();
      const tags = metadata(paste, publicUrl);
      const html = template.replace(/\{\{(TITLE|TEXT|METADATA)\}\}/g, (_, field) =>
        field === "METADATA" ? tags : escapeHtml(field === "TITLE" ? paste.title ?? "" : paste.text)
      );
      return new Response(html, {
        headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (!editable || !editKey) {
      return new Response("Forbidden", { status: 403, headers });
    }

    if (req.method === "DELETE") {
      return database.deletePaste(id, editKey)
        ? new Response(null, { status: 204, headers })
        : new Response("404: Page not found.", { status: 404, headers });
    }

    let json;
    try {
      json = await req.json();
    } catch {
      return new Response("Bad Request", { status: 400, headers });
    }
    if (
      !json ||
      typeof json.text !== "string" ||
      !json.text ||
      (json.title !== undefined && typeof json.title !== "string")
    ) return new Response("Invalid request.", { status: 400, headers });

    return database.updateText(id, editKey, json.text, json.title ?? "")
      ? new Response(null, { status: 204, headers })
      : new Response("404: Page not found.", { status: 404, headers });
  } catch (err) {
    console.error(err);
    return new Response("Internal server error.", { status: 500, headers });
  }
}

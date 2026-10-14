import * as database from "../utils/database";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
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
      const html = template.replace(/\{\{(TITLE|TEXT)\}\}/g, (_, field) =>
        escapeHtml(field === "TITLE" ? paste.title ?? "" : paste.text)
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

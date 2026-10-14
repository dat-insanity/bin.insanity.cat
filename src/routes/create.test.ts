import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Never write test posts to the application's database.
Bun.env.DATABASE_PATH = ":memory:";
const { default: create } = await import("./create");
const { default: router } = await import("../utils/router");
const url = "http://localhost/create";

async function createPost(text = "sample text", title = "sample title") {
  const response = await create(new Request(url, {
    method: "POST",
    body: JSON.stringify({ text, title }),
  }));
  expect(response.status).toBe(200);
  return new URL(await response.text());
}

function mutate(url: URL, method: string, body?: unknown) {
  return router(new Request(url.href, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
}

test("rejects non-POST methods", async () => {
  const req = new Request(url, { method: "GET" });
  const res = await create(req);
  expect(res.status).toBe(405);
});

test("handles invalid JSON", async () => {
  const req = new Request(url, {
    method: "POST",
    body: "invalid json",
  });
  const res = await create(req);
  expect(res.status).toBe(400);
});

test("requires text in request body", async () => {
  const req = new Request(url, {
    method: "POST",
    body: JSON.stringify({ text: "" }),
  });
  const res = await create(req);
  expect(res.status).toBe(400);
  expect(await res.text()).toBe("Invalid request.");
});

test("requires not empty request body", async () => {
  const req = new Request(url, {
    method: "POST",
  });
  const res = await create(req);
  expect(res.status).toBe(400);
  expect(await res.text()).toBe("Bad Request");
});

test("writes text to the database and returns a URL", async () => {
  const req = new Request(url, {
    method: "POST",
    body: JSON.stringify({ text: "sample text" }),
  });

  const res = await create(req);
  expect(res.status).toBe(200);
  const editUrl = new URL(await res.text());
  expect(editUrl.pathname).toMatch(/^\/[1-9]\d*$/);
  expect(editUrl.searchParams.get("EDIT")).toMatch(/^[a-f0-9]{64}$/);
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  const raw = await router(new Request(new URL(`/raw${editUrl.pathname}`, editUrl).href));
  expect(await raw.text()).toBe("sample text");
});

test("each post gets a different edit key", async () => {
  const first = await createPost();
  const second = await createPost();
  expect(first.searchParams.get("EDIT")).not.toBe(second.searchParams.get("EDIT"));
});

test("valid edit links show populated fields, save, and delete", async () => {
  const editUrl = await createPost("hello\nworld", "my post");
  const response = await router(new Request(editUrl.href));
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  const html = await response.text();
  expect(html).toContain('id="delete"');
  expect(html).toContain('id="save"');
  expect(html).toContain('value="my post"');
  expect(html).toContain('aria-label="Post text">\nhello\nworld</textarea>');
});

test("missing, empty, wrong, and lowercase keys return only the static view", async () => {
  const editUrl = await createPost("public body", "public title");
  for (const search of ["", "?EDIT=", "?EDIT=wrong", `?edit=${editUrl.searchParams.get("EDIT")}`]) {
    const publicUrl = new URL(editUrl);
    publicUrl.search = search;
    const response = await router(new Request(publicUrl.href));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('id="title">public title</h1>');
    expect(html).toContain('id="paste">public body</p>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain('id="delete"');
    expect(html).not.toContain('id="save"');
    expect(html).not.toContain(editUrl.searchParams.get("EDIT")!);
  }
});

test("saving updates the existing post and keeps the same key", async () => {
  const editUrl = await createPost();
  const response = await mutate(editUrl, "PUT", { text: "updated\nbody", title: "updated title" });
  expect(response.status).toBe(204);
  const raw = await router(new Request(new URL(`/raw${editUrl.pathname}`, editUrl).href));
  const title = await router(new Request(new URL(`/raw/title${editUrl.pathname}`, editUrl).href));
  expect(await raw.text()).toBe("updated\nbody");
  expect(await title.text()).toBe("updated title");
  const editor = await router(new Request(editUrl.href));
  expect(await editor.text()).toContain('id="delete"');
});

test("mutations without this post's key cannot modify or delete it", async () => {
  const editUrl = await createPost();
  const otherPost = await createPost();
  for (const search of ["", "?EDIT=", "?EDIT=wrong", otherPost.search]) {
    const unauthorizedUrl = new URL(editUrl);
    unauthorizedUrl.search = search;
    for (const method of ["PUT", "DELETE"]) {
      const response = await mutate(unauthorizedUrl, method, method === "PUT" ? { text: "tampered" } : undefined);
      expect(response.status).toBe(403);
    }
  }
  const raw = await router(new Request(new URL(`/raw${editUrl.pathname}`, editUrl).href));
  expect(await raw.text()).toBe("sample text");
});

test("deleting a post removes its public, editor, raw, and title views", async () => {
  const editUrl = await createPost();
  expect((await mutate(editUrl, "DELETE")).status).toBe(204);
  for (const path of [editUrl.pathname, `/raw${editUrl.pathname}`, `/raw/title${editUrl.pathname}`]) {
    expect((await router(new Request(new URL(path, editUrl).href))).status).toBe(404);
  }
  expect((await router(new Request(editUrl.href))).status).toBe(404);
  expect((await mutate(editUrl, "DELETE")).status).toBe(404);
});

test("invalid post bodies are rejected during creation and editing", async () => {
  const editUrl = await createPost();
  for (const body of [null, [], {}, { text: "" }, { text: 123 }, { text: "valid", title: {} }]) {
    expect((await create(new Request(url, { method: "POST", body: JSON.stringify(body) }))).status).toBe(400);
    expect((await mutate(editUrl, "PUT", body)).status).toBe(400);
  }
  const malformed = await router(new Request(editUrl.href, { method: "PUT", body: "invalid json" }));
  expect(malformed.status).toBe(400);
  const raw = await router(new Request(new URL(`/raw${editUrl.pathname}`, editUrl).href));
  expect(await raw.text()).toBe("sample text");
});

test("post content is escaped in both the public view and editor", async () => {
  const text = '</textarea><script>alert("text")</script> & {{TITLE}}';
  const title = '\"><script>alert("title")</script> & {{TEXT}}';
  const editUrl = await createPost(text, title);
  for (const search of [editUrl.search, ""]) {
    const target = new URL(editUrl);
    target.search = search;
    const html = await (await router(new Request(target.href))).text();
    expect(html).toContain("&lt;/textarea&gt;&lt;script&gt;alert(&quot;text&quot;)&lt;/script&gt; &amp; {{TITLE}}");
    expect(html).toContain("&quot;&gt;&lt;script&gt;alert(&quot;title&quot;)&lt;/script&gt; &amp; {{TEXT}}");
    expect(html).not.toContain('<script>alert("');
  }
  const raw = await router(new Request(new URL(`/raw${editUrl.pathname}`, editUrl).href));
  expect(raw.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
  expect(await raw.text()).toBe(text);
});

test("invalid paths and missing posts return 404; unsupported methods return 405", async () => {
  for (const path of ["/0", "/-1", "/123suffix", "/raw/1suffix", "/raw/title/1suffix", "/999999", "/raw/999999", "/raw/title/999999"]) {
    expect((await router(new Request(new URL(path, url).href))).status).toBe(404);
  }
  const editUrl = await createPost();
  const response = await mutate(editUrl, "POST", { text: "updated" });
  expect(response.status).toBe(405);
  expect(response.headers.get("Allow")).toBe("GET, PUT, DELETE");
});

test("existing databases migrate safely and store only hashed keys", () => {
  const directory = mkdtempSync(join(tmpdir(), "bin-insanity-cat-test-"));
  const databasePath = join(directory, "legacy.sqlite");
  const legacy = new Database(databasePath, { create: true });
  legacy.query("CREATE TABLE pastes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, title TINYTEXT);").run();
  legacy.query("INSERT INTO pastes (text, title) VALUES ('old text', 'old title');").run();
  legacy.close();
  try {
    const databaseModule = new URL("../utils/database.ts", import.meta.url).href;
    const routerModule = new URL("../utils/router.ts", import.meta.url).href;
    const script = `
      const database = await import(${JSON.stringify(databaseModule)});
      const { default: router } = await import(${JSON.stringify(routerModule)});
      const post = database.writeText("new text", "new title");
      const response = await router(new Request("http://localhost/1?EDIT=wrong"));
      const html = await response.text();
      const denied = await router(new Request("http://localhost/1?EDIT=wrong", { method: "DELETE" }));
      console.log(JSON.stringify({
        legacy: database.getPaste(1),
        editable: database.canEdit(1, post.editKey),
        newEditable: database.canEdit(post.id, post.editKey),
        static: !html.includes("<script>") && !html.includes('id="delete"'),
        denied: denied.status,
        post
      }));
    `;
    for (let attempt = 0; attempt < 2; attempt++) {
      const child = Bun.spawnSync([process.execPath, "-e", script], {
        env: { ...process.env, DATABASE_PATH: databasePath },
      });
      expect(new TextDecoder().decode(child.stderr)).toBe("");
      expect(child.exitCode).toBe(0);
      const result = JSON.parse(new TextDecoder().decode(child.stdout));
      expect(result.legacy).toEqual({ id: 1, text: "old text", title: "old title" });
      expect(result.editable).toBe(false);
      expect(result.newEditable).toBe(true);
      expect(result.static).toBe(true);
      expect(result.denied).toBe(403);
      const inspect = new Database(databasePath);
      try {
        const stored = inspect.query("SELECT edit_key_hash FROM pastes WHERE id = $id;")
          .get({ $id: result.post.id }) as { edit_key_hash: string };
        expect(stored.edit_key_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(stored.edit_key_hash).not.toBe(result.post.editKey);
      } finally {
        inspect.close();
      }
    }
  } finally {
    unlinkSync(databasePath);
    rmdirSync(directory);
  }
});

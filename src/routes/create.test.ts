import { expect, spyOn, test, type Mock } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdtempSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Never write test posts to the application's database.
Bun.env.DATABASE_PATH = ":memory:";
const { default: create } = await import("./create");
const { default: router } = await import("../utils/router");
const database = await import("../utils/database");
const slugs = await import("../utils/slug");
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

function metaContent(html: string, property: string): string | null {
  return html.match(new RegExp(`<meta property="${property}" content="([^"]*)"`))?.[1] ?? null;
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
  expect(editUrl.pathname).toMatch(/^\/[a-z0-9]{8}$/);
  expect(editUrl.searchParams.get("EDIT")).toMatch(/^[a-f0-9]{64}$/);
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  const raw = await router(new Request(new URL(`/raw${editUrl.pathname}`, editUrl).href));
  expect(await raw.text()).toBe("sample text");
});

test("each post gets a different edit key", async () => {
  const first = await createPost();
  const second = await createPost();
  expect(first.searchParams.get("EDIT")).not.toBe(second.searchParams.get("EDIT"));
  expect(first.pathname).not.toBe(second.pathname);
});

test("slug collisions are retried without overwriting another post", () => {
  const existing = database.writeText("original contents", "original title");
  let availableSlug = slugs.generateSlug();
  while (database.getPaste(availableSlug)) availableSlug = slugs.generateSlug();
  // The older bun-types package models function spies as property getters.
  const generator = spyOn(slugs, "generateSlug") as unknown as Mock<typeof slugs.generateSlug>;
  generator.mockReturnValueOnce(existing.slug).mockReturnValueOnce(availableSlug);
  try {
    const created = database.writeText("new contents", "new title");
    expect(generator).toHaveBeenCalledTimes(2);
    expect(created.slug).toBe(availableSlug);
    expect(database.getPaste(existing.slug)!.text).toBe("original contents");
    expect(database.getPaste(created.slug)!.text).toBe("new contents");
    expect(database.canEdit(created.slug, created.editKey)).toBe(true);
  } finally {
    generator.mockRestore();
  }
});

test("new posts cannot be reached by their internal numeric IDs", async () => {
  const post = database.writeText("slug-only post", "title");
  for (const prefix of ["", "/raw", "/raw/title"]) {
    const numericUrl = `http://localhost${prefix}/${post.id}?EDIT=${post.editKey}`;
    expect((await router(new Request(numericUrl))).status).toBe(404);
  }
  for (const method of ["PUT", "DELETE"]) {
    expect((await mutate(new URL(`http://localhost/${post.id}?EDIT=${post.editKey}`), method,
      method === "PUT" ? { text: "tampered" } : undefined)).status).toBe(404);
  }
  expect(database.getPaste(post.slug)!.text).toBe("slug-only post");
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
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<link\b[^>]*\brel=["']modulepreload/i);
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
  for (const path of ["/0", "/-1", "/123suffix", "/raw/1suffix", "/raw/title/1suffix", "/999999", "/raw/999999", "/raw/title/999999", "/abcDEF12", "/abcdefg", "/abcdefghi", "/abc_def1", "/raw/ABCDEF12", "/raw/title/abcdefg", "/abcdefg1/extra"]) {
    expect((await router(new Request(new URL(path, url).href))).status).toBe(404);
  }
  const editUrl = await createPost();
  const response = await mutate(editUrl, "POST", { text: "updated" });
  expect(response.status).toBe(405);
  expect(response.headers.get("Allow")).toBe("GET, PUT, DELETE");
});

test("post previews contain the title and full contents on the server", async () => {
  const text = 'First line: "quoted" & <text>\n' + "Full post contents. ".repeat(30);
  const editUrl = await createPost(text, 'A "post" & <title>');
  for (const search of ["", "?EDIT=wrong", editUrl.search]) {
    const target = new URL(editUrl);
    target.search = search;
    const html = await (await router(new Request(target.href))).text();
    expect(html).toContain("<title>A &quot;post&quot; &amp; &lt;title&gt;</title>");
    expect(metaContent(html, "og:type")).toBe("article");
    expect(metaContent(html, "og:title")).toBe("A &quot;post&quot; &amp; &lt;title&gt;");
    expect(metaContent(html, "og:description")).toBe(
      "First line: &quot;quoted&quot; &amp; &lt;text&gt;\n" + "Full post contents. ".repeat(30)
    );
  }
});

test("blank titles fall back to bin.insanity.cat in previews and page titles", async () => {
  for (const title of ["", " \t\n"]) {
    const editUrl = await createPost("untitled post", title);
    for (const search of ["", editUrl.search]) {
      const target = new URL(editUrl);
      target.search = search;
      const html = await (await router(new Request(target.href))).text();
      expect(html).toContain("<title>bin.insanity.cat</title>");
      expect(metaContent(html, "og:title")).toBe("bin.insanity.cat");
    }
  }
});

test("site_name reports the character count including whitespace and combined emoji", async () => {
  for (const [text, count] of [["abc", 3], ["😺", 1], ["👩‍👩‍👧‍👦e\u0301\n", 3]] as const) {
    const editUrl = await createPost(text);
    editUrl.search = "";
    const html = await (await router(new Request(editUrl.href))).text();
    expect(metaContent(html, "og:site_name")).toBe(`${count} ${count === 1 ? "character" : "characters"}`);
  }
});

test("publication timestamps are stored at creation and preserved by edits", async () => {
  const before = Date.now();
  const editUrl = await createPost();
  const after = Date.now();
  const slug = editUrl.pathname.slice(1);
  const createdAt = database.getPaste(slug)!.created_at!;
  expect(createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  expect(Date.parse(createdAt)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(createdAt)).toBeLessThanOrEqual(after);
  expect(metaContent(await (await router(new Request(editUrl.href))).text(), "article:published_time"))
    .toBe(createdAt);
  expect((await mutate(editUrl, "PUT", { text: "new body", title: "new title" })).status).toBe(204);
  expect(database.getPaste(slug)!.created_at).toBe(createdAt);
  editUrl.search = "";
  const html = await (await router(new Request(editUrl.href))).text();
  expect(metaContent(html, "article:published_time")).toBe(createdAt);
  expect(metaContent(html, "og:title")).toBe("new title");
  expect(metaContent(html, "og:description")).toBe("new body");
  expect(metaContent(html, "og:site_name")).toBe("8 characters");
});

test("preview and canonical URLs use the public host and exclude edit keys and other queries", async () => {
  const originalServerUrl = Bun.env.SERVER_URL;
  const originalProtocol = Bun.env.PROTOCOL;
  try {
    Bun.env.SERVER_URL = "bin.insanity.cat";
    Bun.env.PROTOCOL = "https";
    const editUrl = await createPost();
    for (const search of ["?EDIT=wrong&tracking=test", `${editUrl.search}&tracking=test`]) {
      const internalUrl = `http://localhost${editUrl.pathname}${search}`;
      const html = await (await router(new Request(internalUrl))).text();
      const publicUrl = `https://bin.insanity.cat${editUrl.pathname}`;
      expect(metaContent(html, "og:url")).toBe(publicUrl);
      expect(html).toContain(`<link rel="canonical" href="${publicUrl}" />`);
      expect(html).not.toContain(editUrl.searchParams.get("EDIT")!);
      expect(html).not.toContain("tracking=test");
    }
  } finally {
    if (originalServerUrl === undefined) delete Bun.env.SERVER_URL;
    else Bun.env.SERVER_URL = originalServerUrl;
    if (originalProtocol === undefined) delete Bun.env.PROTOCOL;
    else Bun.env.PROTOCOL = originalProtocol;
  }
});

for (const schema of ["original", "edit keys", "publication dates"] as const) {
  const hasEditKeys = schema !== "original";
  const hasPublicationDates = schema === "publication dates";
test(`existing databases with ${schema} schema migrate safely to slugs`, () => {
  const directory = mkdtempSync(join(tmpdir(), "bin-insanity-cat-test-"));
  const databasePath = join(directory, "legacy.sqlite");
  const legacy = new Database(databasePath, { create: true });
  legacy.query(`CREATE TABLE pastes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, title TINYTEXT
    ${hasEditKeys ? ", edit_key_hash TEXT" : ""}
    ${hasPublicationDates ? ", created_at TEXT" : ""}
  );`).run();
  legacy.query("INSERT INTO pastes (text, title) VALUES ('old text', 'old title');").run();
  if (hasEditKeys) {
    legacy.query("INSERT INTO pastes (text, title, edit_key_hash) VALUES ('owned text', 'owned title', $key);")
      .run({ $key: createHash("sha256").update("legacy-key").digest("hex") });
  }
  if (hasPublicationDates) {
    legacy.query("UPDATE pastes SET created_at = '2023-10-01T12:34:56.000Z' WHERE id = 2;").run();
  }
  legacy.close();
  try {
    const databaseModule = new URL("../utils/database.ts", import.meta.url).href;
    const routerModule = new URL("../utils/router.ts", import.meta.url).href;
    const script = `
      const database = await import(${JSON.stringify(databaseModule)});
      const { default: router } = await import(${JSON.stringify(routerModule)});
      const legacy = database.getLegacyPaste(1);
      const post = database.writeText("new text", "new title");
      const response = await router(new Request("http://localhost/1?EDIT=wrong"));
      const html = await (await router(new Request(new URL(response.headers.get("Location"), "http://localhost").href))).text();
      const denied = await router(new Request("http://localhost/" + legacy.slug + "?EDIT=wrong", { method: "DELETE" }));
      const redirects = [];
      for (const prefix of ["", "/raw", "/raw/title"]) {
        const redirect = await router(new Request("http://localhost" + prefix + "/1?EDIT=wrong"));
        const resolved = await router(new Request(new URL(redirect.headers.get("Location"), "http://localhost").href));
        redirects.push({ status: redirect.status, location: redirect.headers.get("Location"),
          resolvedStatus: resolved.status, text: prefix ? await resolved.text() : null });
      }
      const ownedRedirect = ${hasEditKeys} ? await router(new Request("http://localhost/2?EDIT=legacy-key", {
        method: "PUT", body: JSON.stringify({ text: "updated old post", title: "owned title" })
      })) : null;
      const owned = ownedRedirect ? await router(new Request(new URL(ownedRedirect.headers.get("Location"), "http://localhost").href, {
        method: "PUT", body: JSON.stringify({ text: "updated old post", title: "owned title" })
      })) : null;
      console.log(JSON.stringify({
        legacy,
        editable: database.canEdit(legacy.slug, post.editKey),
        newEditable: database.canEdit(post.slug, post.editKey),
        static: !html.includes("<script>") && !html.includes('id="delete"'),
        unknownPublication: !html.includes('property="article:published_time"'),
        ownedStatus: owned?.status,
        ownedRedirectStatus: ownedRedirect?.status,
        ownedRedirectLocation: ownedRedirect?.headers.get("Location"),
        ownedSlug: ${hasEditKeys} ? database.getLegacyPaste(2).slug : null,
        ownedPublication: ${hasEditKeys} ? database.getLegacyPaste(2).created_at : null,
        createdAt: database.getPaste(post.slug).created_at,
        newNumericStatus: (await router(new Request("http://localhost/" + post.id))).status,
        redirects,
        denied: denied.status,
        post
      }));
    `;
    const timestamps = new Map<number, string>();
    let originalSlug: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const child = Bun.spawnSync([process.execPath, "-e", script], {
        env: { ...process.env, DATABASE_PATH: databasePath },
      });
      expect(new TextDecoder().decode(child.stderr)).toBe("");
      expect(child.exitCode).toBe(0);
      const result = JSON.parse(new TextDecoder().decode(child.stdout));
      expect(result.legacy).toEqual({ id: 1, slug: result.legacy.slug, text: "old text", title: "old title", created_at: null });
      expect(result.legacy.slug).toMatch(/^[a-z0-9]{8}$/);
      if (originalSlug) expect(result.legacy.slug).toBe(originalSlug);
      else originalSlug = result.legacy.slug;
      expect(result.post.slug).toMatch(/^[a-z0-9]{8}$/);
      expect(result.post.slug).not.toBe(result.legacy.slug);
      expect(result.newNumericStatus).toBe(404);
      expect(result.redirects).toEqual([
        { status: 308, location: `/${result.legacy.slug}?EDIT=wrong`, resolvedStatus: 200, text: null },
        { status: 308, location: `/raw/${result.legacy.slug}?EDIT=wrong`, resolvedStatus: 200, text: "old text" },
        { status: 308, location: `/raw/title/${result.legacy.slug}?EDIT=wrong`, resolvedStatus: 200, text: "old title" },
      ]);
      expect(result.editable).toBe(false);
      expect(result.newEditable).toBe(true);
      expect(result.static).toBe(true);
      expect(result.unknownPublication).toBe(true);
      expect(new Date(result.createdAt).toISOString()).toBe(result.createdAt);
      if (hasEditKeys) {
        expect(result.ownedStatus).toBe(204);
        expect(result.ownedRedirectStatus).toBe(308);
        expect(result.ownedRedirectLocation).toBe(`/${result.ownedSlug}?EDIT=legacy-key`);
        expect(result.ownedPublication).toBe(hasPublicationDates ? "2023-10-01T12:34:56.000Z" : null);
      }
      timestamps.set(result.post.id, result.createdAt);
      expect(result.denied).toBe(403);
      const inspect = new Database(databasePath);
      try {
        const stored = inspect.query("SELECT edit_key_hash FROM pastes WHERE id = $id;")
          .get({ $id: result.post.id }) as { edit_key_hash: string };
        expect(stored.edit_key_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(stored.edit_key_hash).not.toBe(result.post.editKey);
        for (const [id, createdAt] of timestamps) {
          const saved = inspect.query("SELECT created_at, legacy_url FROM pastes WHERE id = $id;")
            .get({ $id: id }) as { created_at: string; legacy_url: number };
          expect(saved.created_at).toBe(createdAt);
          expect(saved.legacy_url).toBe(0);
        }
      } finally {
        inspect.close();
      }
    }
  } finally {
    unlinkSync(databasePath);
    rmdirSync(directory);
  }
});
}

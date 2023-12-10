import { expect, test } from "bun:test";
import create from "./create";

const url = `${Bun.env.PROTOCOL}://${Bun.env.HOSTNAME}:${Bun.env.PORT}/create`;

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
  expect(await res.text()).toMatch(
    new RegExp(`^${Bun.env.PROTOCOL}://${Bun.env.SERVER_URL}/raw/.+$`)
  );
});

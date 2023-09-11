import create from "./routes/create.ts";

Bun.serve({
  port: Bun.env.PORT,
  hostname: Bun.env.HOSTNAME,
  fetch(req) {
    return create(req);
  },
});

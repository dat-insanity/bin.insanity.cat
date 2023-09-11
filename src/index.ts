Bun.serve({
  port: Bun.env.PORT,
  hostname: Bun.env.HOSTNAME,
  fetch(req) {
    return new Response("hello world");
  },
});

import router from "./utils/router.ts";

Bun.serve({
  port: Bun.env.PORT,
  hostname: Bun.env.HOSTNAME,
  fetch(req) {
    return router(req);
  },
});

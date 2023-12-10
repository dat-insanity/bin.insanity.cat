import router from "./utils/router.ts";

if (!(await Bun.file(".env").exists())) {
  throw new Error("Missing .env file. A template is provided at .env.example.");
}

if (
  Bun.env.PORT &&
  Bun.env.HOSTNAME &&
  Bun.env.PROTOCOL &&
  Bun.env.SERVER_URL
) {
  Bun.serve({
    port: Bun.env.PORT,
    hostname: Bun.env.HOSTNAME,
    fetch(req) {
      return router(req);
    },
  });
} else {
  throw new Error(
    "Missing environment variables. A template is provided at .env.example."
  );
}

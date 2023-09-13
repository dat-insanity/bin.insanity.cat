export default async function index(req: Request) {
  return new Response(Bun.file("./src/public/index.html"));
}

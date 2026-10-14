# bin.insanity.cat

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run src/index.ts
```

This project was created using `bun init` in bun v1.0.0. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

Copy `.env.example` to `.env` and configure the server before starting it.

Creating a post returns `/<id>?EDIT=<generated key>`. Keep this URL to edit the
title and text or delete the post without an account. Anyone with that URL can
manage the post. Remove the `EDIT` query parameter before sharing a read-only
link. Missing or incorrect keys return a static view and cannot change the post.

Existing databases are migrated automatically. Posts created before edit keys
were introduced remain read-only. Only a hash of each edit key is stored.
Set `DATABASE_PATH` to use another database file (defaults to `pastes.sqlite`).

Run the regression tests with `bun test`. Tests use an isolated database.

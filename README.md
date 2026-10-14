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

Post views are rendered entirely on the server and ship no JavaScript. They
include Open Graph metadata: the post title (or `bin.insanity.cat` when blank),
the full text as the description, and the text's character count as
`og:site_name`. Character counts include whitespace and treat combined emoji
and accented characters as single characters. Preview and canonical URLs never
include the edit key. Only the creation and editing pages use JavaScript.

New posts store their publication time as an ISO 8601 UTC timestamp in
`created_at`. Edits preserve this timestamp, which is used for
`article:published_time`. Older posts retain an unknown (`NULL`) publication
time and omit the publication-date tag.

Run the regression tests with `bun test`. Tests use an isolated database.

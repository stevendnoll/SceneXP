Thank you for contributing to SceneXP. We read every pull request with genuine delight.

## What does this change?

Tell us what you built or fixed, and the story behind it if there is one.

## Checklist

- [ ] I ran `npm run build` after my last edit, so the minified assets match the source.
- [ ] `npm test` passes locally.
- [ ] New or changed code comes with unit tests (CI enforces a coverage floor on the shared modules).
- [ ] Any user-facing text follows the site's warm, welcoming tone (and avoids em-dashes and semicolons).

### Adding a new experience? A few more:

- [ ] The page follows the metadata pattern from an existing experience (same-origin CSP, Open Graph and Twitter tags, JSON-LD, and a polite no-JavaScript fallback).
- [ ] The experience is listed in `www/index.html` (card and JSON-LD), `www/js/directory.js`, `www/sitemap.xml`, and `www/llms.txt`.
- [ ] The experience has an init test following the `tests/<experience>-init.test.mjs` pattern.
- [ ] If it honors a real person or business, they are celebrated kindly and with their permission, per our [code of conduct](../CODE_OF_CONDUCT.md).

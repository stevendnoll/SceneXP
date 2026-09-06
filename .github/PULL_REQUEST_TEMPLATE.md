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
- [ ] A 1200 by 630 social card ships as `assets/og-<world>.webp` with a `.jpg` beside it, converted out of the display profile rather than straight off a Mac (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
- [ ] The experience is listed in `www/index.html` (a card in its category's group, and that group's JSON-LD `ItemList`), `www/sitemap.xml`, and `www/llms.txt`. There is no catalog array: the cards are the list.
- [ ] Its slug and category are in the `CATEGORY_OF` map in `tests/directory.test.mjs`, which is what holds the card and the grouping together.
- [ ] Anything the world writes to `localStorage` is named in `www/privacy.html`, along with how a visitor clears it. (`sessionStorage` needs nothing, and `tests/privacy.test.mjs` will tell you if this was missed.)
- [ ] The experience has an init test following the `tests/<experience>-init.test.mjs` pattern.
- [ ] If it honors a real person or business, they are celebrated kindly and with their permission, per our [code of conduct](../CODE_OF_CONDUCT.md).

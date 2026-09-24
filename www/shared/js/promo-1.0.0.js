// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * promo.js - What to show a visitor who has just finished something (shared
 * engine part).
 *
 * A VISITOR WHO HAS JUST FINISHED IS THE ONLY ONE WITH AN OPINION. They have
 * played the game or watched the scene through, they either liked it or they
 * did not, and until now the only thing this site said to them at that moment
 * was "play again". Somebody arriving straight at www/xo has no way of knowing
 * there are fourteen other experiences here.
 *
 * A NAME BEATS A DIRECTORY, which is the one design decision in this file. The
 * obvious move is a link to the home page, and every scene's WELCOME screen has
 * carried exactly that sentence for months without moving anybody: it asks a
 * visitor to go and browse, which is work, and it is an exit. A named
 * recommendation with the art on it is one tap and answers the question
 * instead of handing it back. The directory link still goes underneath as the
 * "show me all of them" escape hatch.
 *
 * THE CATALOG IS A COPY OF THE HOME PAGE AND IS ASSERTED AGAINST IT.
 * www/index.html's markup is the source of truth for what exists here, which is
 * a decision `tests/directory.test.mjs` already enforces across the home page,
 * the sitemap and llms.txt. This is a fourth copy, so it is held to the same
 * rule: that suite reads the home markup and fails if a slug, a title, a line
 * or an image path here disagrees with it, or if an experience is added there
 * and forgotten here. Nothing in this file is allowed to be independently true.
 *
 * `line` IS THE HOME PAGE'S EYEBROW, not its paragraph. The eyebrow is already
 * the one-sentence version of every experience ("A football game where you call
 * the plays"), it is already written, and a promo card has room for exactly
 * that much.
 *
 * WHICH ONE COMES NEXT IS CURATED FIRST AND DERIVED SECOND. `PAIRS` is Steve's
 * to edit and holds the affinities a rule cannot know: X's and O's and Earth
 * Defense are both games somebody plays in one sitting, and the Mandelbrot
 * zoom and the Fractal Garden are both fractals whether or not they sit
 * together on the home page. Anything not named there falls through to the next
 * experience in the same category, wrapping, which means a new scene is never
 * a dead end on the day it lands even if nobody has curated it yet.
 */

/** Every published experience, in the order the home page lists them.
 *
 *  ORDER MATTERS: the fallback in `nextSlug` walks this list, so within a
 *  category "next" means "the one listed after it", and the home page is newest
 *  first, which makes the default recommendation the next-newest thing of the
 *  same kind. That is a reasonable thing to say to somebody without anybody
 *  having decided it.
 *
 *  `art` carries the home page's own cache-busting query string verbatim, so a
 *  visitor who has seen the directory already has the file. */
export const EXPERIENCES = Object.freeze([
    { slug: 'tornado', category: 'worlds', title: 'Tornado Alley', line: "A storm chaser's view of a tornado", art: '/tornado/assets/og-tornado.webp?v=1' },
    { slug: 'xo', category: 'worlds', title: "X's and O's", line: 'A football game where you call the plays', art: '/xo/assets/og-xo.webp?v=1' },
    { slug: 'garden', category: 'worlds', title: 'Fractal Garden', line: 'A garden you plant and tend yourself', art: '/garden/assets/og-garden.webp?v=3' },
    { slug: 'highwater', category: 'worlds', title: 'High Water', line: 'A study of water and weather', art: '/highwater/assets/og-highwater.webp?v=1' },
    { slug: 'earthdefense', category: 'worlds', title: 'Earth Defense', line: 'Built for the joy of flying through space', art: '/earthdefense/assets/og-earthdefense.webp?v=2' },
    { slug: 'mandelbrot', category: 'worlds', title: 'The Mandelbrot Set', line: 'For Benoit Mandelbrot', art: '/mandelbrot/assets/og-mandelbrot.webp' },
    { slug: 'steve', category: 'worlds', title: "Steve's Home Office", line: 'Where SceneXP gets built', art: '/steve/assets/og-steve.webp' },
    { slug: 'automan', category: 'business', title: 'John Walker, The Auto Man', line: 'For a car buying advocate', art: '/automan/assets/card-automan.webp?v=1' },
    { slug: 'interstate', category: 'business', title: 'The Interstate Tire Shop', line: 'For a neighborhood tire shop', art: '/interstate/assets/og-interstate.webp' },
    { slug: 'seedtoseed', category: 'business', title: 'The Seed to Seed Garden', line: 'For a gardening business', art: '/seedtoseed/assets/og-seedtoseed.webp' },
    { slug: 'sunnyvalejenn', category: 'business', title: 'Sunnyvale Jenn Consulting', line: 'For a small business operations consultant', art: '/sunnyvalejenn/assets/og-sunnyvalejenn.webp?v=1' },
    { slug: 'jamar', category: 'personal', title: "Jamar's Karaoke Night", line: 'Happy Birthday, Jamar!', art: '/jamar/assets/og-jamar.webp' },
    { slug: 'gavin', category: 'personal', title: "Gavin's Bug Patrol", line: 'For Gavin, age eleven', art: '/gavin/assets/og-gavin.webp' },
    { slug: 'roqui', category: 'personal', title: 'Zumba with Roqui', line: 'For a wonderful instructor', art: '/roqui/assets/og-roqui.webp' },
    { slug: 'family', category: 'personal', title: 'Putt Putt with Mom and Dad', line: 'For a family summer memory', art: '/family/assets/og-family.webp' },
    { slug: 'dad', category: 'personal', title: 'A Ride on the NCR Trail', line: 'In memory of a dad', art: '/dad/assets/og-dad.webp' }
]);

/** Hand-picked "if you liked this, try that", and STEVE'S TO EDIT.
 *
 *  Only worth an entry where the affinity is real and a rule would miss it.
 *  Everything else falls through to the next in category, which is a fine
 *  answer and needs no maintenance.
 *
 *  These do not have to be symmetric. They happen to be, because both pairs
 *  below are two halves of one recommendation, but a scene may point at
 *  something that points somewhere else. */
export const PAIRS = Object.freeze({
    // Two games you finish in one sitting, which is a stronger tie than the
    // home page's newest-first order can express.
    xo: 'earthdefense',
    earthdefense: 'xo',
    // Two fractals. One you fall into and one you grow.
    mandelbrot: 'garden',
    garden: 'mandelbrot'
});

/** One experience, by slug, or null. */
export function experience(slug) {
    return EXPERIENCES.find((e) => e.slug === slug) || null;
}

/** Which slug to recommend after `slug`: the curated pair, else the next in the
 *  same category, wrapping round to the first.
 *
 *  Returns null for a slug this file has never heard of, which is what an
 *  unpublished scene (www/job, www/trail) gets, and for a category of one.
 *  A card that cannot be built is simply not shown. */
export function nextSlug(slug) {
    const paired = PAIRS[slug];
    if (paired && experience(paired)) return paired;

    const here = experience(slug);
    if (!here) return null;
    const siblings = EXPERIENCES.filter((e) => e.category === here.category);
    if (siblings.length < 2) return null;
    const at = siblings.findIndex((e) => e.slug === slug);
    return siblings[(at + 1) % siblings.length].slug;
}

/** The experience to recommend after `slug`, whole, or null. */
export function nextExperience(slug) {
    return experience(nextSlug(slug));
}

/**
 * Build the recommendation card: art, eyebrow, title, one line, all inside one
 * link.
 *
 * ONE LINK AND NOT A CARD FULL OF THEM, because the whole thing is one idea and
 * a visitor should be able to hit it with a thumb. The image is `alt=""` on
 * purpose: the title sits immediately beside it inside the same link, so a
 * screen reader reading the art as well would say the name of the experience
 * twice.
 *
 * LAZY, AND THE SAME FILE THE HOME PAGE ALREADY USES. These are the og WebPs at
 * 40 to 70KB, which the directory also loads lazily, so a visitor who came in
 * through the home page has it cached. It is requested when the end card is
 * built rather than at boot, which is after the scene has stopped needing the
 * network.
 *
 * Returns null when there is nothing to recommend or no document to build in,
 * and the caller simply shows no card.
 */
export function createPromoCard(slug, { eyebrow = 'Next on SceneXP', doc = null } = {}) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || typeof d.createElement !== 'function') return null;
    const next = nextExperience(slug);
    if (!next) return null;

    const link = d.createElement('a');
    link.className = 'promo-card';
    link.href = `/${next.slug}/`;
    link.dataset.slug = next.slug;

    const art = d.createElement('img');
    art.className = 'promo-art';
    art.src = next.art;
    art.alt = '';
    art.loading = 'lazy';
    art.decoding = 'async';
    // The og images are all 1200x630. Stated so the card reserves its space
    // before the image arrives rather than reflowing the end screen under a
    // visitor who is already reading it.
    art.width = 1200;
    art.height = 630;
    link.appendChild(art);

    const body = d.createElement('span');
    body.className = 'promo-body';

    const kicker = d.createElement('span');
    kicker.className = 'promo-eyebrow';
    kicker.textContent = eyebrow;
    body.appendChild(kicker);

    const title = d.createElement('span');
    title.className = 'promo-title';
    title.textContent = next.title;
    body.appendChild(title);

    const line = d.createElement('span');
    line.className = 'promo-line';
    line.textContent = next.line;
    body.appendChild(line);

    link.appendChild(body);
    return link;
}

/**
 * The quiet link to the whole directory, which goes UNDER the card.
 *
 * The same sentence and the same class every welcome screen already uses, so a
 * visitor meets one wording for "there is more here" rather than two. It is
 * second on purpose: the named card is the recommendation and this is the
 * escape hatch, and putting the escape hatch first turns a suggestion back into
 * a chore.
 */
export function createDirectoryLink({ text = 'More 3D worlds to explore at SceneXP.com', doc = null } = {}) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || typeof d.createElement !== 'function') return null;
    const link = d.createElement('a');
    link.className = 'welcome-explore promo-explore';
    link.href = '/';
    link.textContent = text;
    return link;
}

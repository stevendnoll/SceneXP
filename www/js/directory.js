// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * directory.js - the searchable experience directory on the home page.
 *
 * The experience cards are static HTML (crawlers and no-JS visitors always
 * see the full list). This script holds the same catalog as a plain array
 * and adds live filtering on top: the search box ships hidden and is only
 * revealed here, so search is pure progressive enhancement.
 *
 * Adding a new experience to the directory means adding one entry below and
 * one matching <li data-slug="..."> card in index.html (plus sitemap.xml).
 */
(function () {
    'use strict';

    var EXPERIENCES = [
        {
            slug: 'dad',
            title: 'A Ride on the NCR Trail',
            honoree: 'In memory of a dad who loved to ride',
            blurb: 'A quiet walkable stretch of Maryland\'s NCR Trail, with the Gunpowder River alongside and a little waterfall to find.',
            place: 'NCR Trail, Maryland',
            url: 'dad/',
            tags: ['memorial', 'tribute', 'trail', 'bike', 'ride', 'nature', 'river', 'walk', 'maryland', 'peaceful']
        },
        {
            slug: 'family',
            title: 'Putt Putt with Mom and Dad',
            honoree: 'For a favorite family summer memory',
            blurb: 'A playable round of pirate mini golf in Ocean City, Maryland, with a pirate ship to board and a plank hole to walk.',
            place: 'Ocean City, Maryland',
            url: 'family/',
            tags: ['family', 'mini golf', 'putt putt', 'pirate', 'beach', 'summer', 'game', 'ocean city', 'parents']
        },
        {
            slug: 'roqui',
            title: 'Zumba with Roqui',
            honoree: 'For a wonderful Zumba instructor',
            blurb: 'A joyful Zumba class at the Matt Griffin YMCA, with a beat to catch, speakers to fire up, and a disco ball to find.',
            place: 'Matt Griffin YMCA',
            url: 'roqui/',
            tags: ['zumba', 'dance', 'fitness', 'music', 'ymca', 'class', 'celebration', 'joy']
        },
        {
            slug: 'seedtoseed',
            title: 'The Seed to Seed Garden',
            honoree: 'For a home vegetable gardening business',
            blurb: 'A professional backyard vegetable garden with raised beds, a walk-in greenhouse, a pumpkin patch, and the gardener himself among the vegetables.',
            place: 'Maryland',
            url: 'seedtoseed/',
            tags: ['garden', 'gardening', 'vegetables', 'greenhouse', 'raised beds', 'business', 'pumpkins', 'seed to seed', 'grow more food']
        },
        {
            slug: 'interstate',
            title: 'The Interstate Tire Shop',
            honoree: 'For a neighborhood tire shop',
            blurb: 'A walkable tire shop with a car up on the lift, a channel-flipping waiting room TV, and historic Railroad Ave leading to the 1892 freight depot.',
            place: 'Cockeysville, Maryland',
            url: 'interstate/',
            tags: ['tires', 'tire shop', 'garage', 'auto', 'brakes', 'alignments', 'business', 'cockeysville', 'railroad ave', 'freight depot', 'interstate tire']
        },
        {
            slug: 'steve',
            title: "Steve's Home Office",
            honoree: 'Where SceneXP gets built',
            blurb: 'The little home office in Steve\'s house where SceneXP gets built, with Steve at his sit-stand desk, the room\'s own code on the monitor, birds on the fence, and a tuxedo cat asleep by the window.',
            place: 'Steve\'s house',
            url: 'steve/',
            tags: ['steve', 'home office', 'developer', 'meta', 'cat', 'standing desk', 'whiteboard', 'code', 'behind the scenes', 'scenexp']
        },
        {
            slug: 'gavin',
            title: "Gavin's Bug Patrol",
            honoree: "For Steve's son Gavin, age eleven",
            blurb: 'A living close-up of the Confederate Jasmine where Gavin releases his ladybugs and praying mantises every spring, with a day and night shift of garden bugs and three mantises hiding for you to spot.',
            place: "Steve's front yard",
            url: 'gavin/',
            tags: ['gavin', 'bugs', 'insects', 'ladybugs', 'praying mantis', 'mantis', 'jasmine', 'garden', 'kids', 'bees', 'fireflies', 'bug patrol', 'entomology', 'nature']
        },
        {
            slug: 'jamar',
            title: "Jamar's Karaoke Night",
            honoree: "For Steve's best friend Jamar",
            blurb: 'Karaoke night at the corner bar, where the birthday singer is Steve\'s best friend Jamar. A rolling lyrics screen, a jukebox for picking his next song, and friends raising a toast from the booth.',
            place: 'The corner bar',
            url: 'jamar/',
            tags: ['jamar', 'karaoke', 'bar', 'music', 'singing', 'birthday', 'jukebox', 'neon', 'disco ball', 'stage', 'friends', 'night out']
        },
        {
            slug: 'mandelbrot',
            title: 'The Mandelbrot Set',
            honoree: 'For Benoit Mandelbrot',
            blurb: 'The most famous shape in mathematics floats in a quiet starfield. Choose a destination on its burning edge, press play, and the auto zoom dives hundreds of billions of times deep.',
            place: 'Deep space',
            url: 'mandelbrot/',
            tags: ['mandelbrot', 'fractal', 'math', 'mathematics', 'zoom', 'infinite', 'space', 'stars', 'spiral', 'science', 'geometry', 'dive']
        }
    ];

    function normalize(text) {
        return text.toLowerCase();
    }

    document.addEventListener('DOMContentLoaded', function () {
        var form = document.getElementById('experience-search-form');
        var input = document.getElementById('experience-search');
        var status = document.getElementById('search-status');
        var empty = document.getElementById('search-empty');
        if (!form || !input) return;

        // Pair each catalog entry with its static card and a precomputed
        // haystack of everything worth matching against.
        var entries = EXPERIENCES.map(function (x) {
            return {
                card: document.querySelector('.experience-card[data-slug="' + x.slug + '"]'),
                haystack: normalize([x.title, x.honoree, x.blurb, x.place, x.tags.join(' ')].join(' '))
            };
        });

        function filter() {
            var query = normalize(input.value.trim());
            var shown = 0;
            entries.forEach(function (entry) {
                var match = !query || entry.haystack.indexOf(query) !== -1;
                if (entry.card) entry.card.hidden = !match;
                if (match) shown++;
            });
            if (empty) empty.hidden = shown !== 0;
            if (status) {
                status.textContent = query
                    ? shown + ' of ' + EXPERIENCES.length + ' experiences shown'
                    : '';
            }
        }

        // The form never submits anywhere: filtering is live as you type.
        form.addEventListener('submit', function (event) {
            event.preventDefault();
        });
        input.addEventListener('input', filter);

        form.hidden = false;
    });
})();

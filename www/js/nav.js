// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * nav.js - the mobile hamburger menu for the base SceneXP.com pages.
 *
 * Pure progressive enhancement, same pattern as the theme toggle: the
 * hamburger button ships hidden in the HTML and the nav stays a plain
 * wrapping row until this script tags <html> with .js-nav and reveals the
 * button. The stylesheet collapses the nav into a dropdown only when both
 * conditions hold (a small screen AND .js-nav), so visitors without
 * JavaScript always keep a usable, scroll-free header.
 */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        var btn = document.getElementById('nav-toggle');
        var nav = document.getElementById('site-nav');
        if (!btn || !nav) return;

        document.documentElement.classList.add('js-nav');
        btn.hidden = false;

        function setOpen(open) {
            nav.classList.toggle('open', open);
            btn.setAttribute('aria-expanded', String(open));
        }

        btn.addEventListener('click', function (event) {
            event.stopPropagation();
            setOpen(!nav.classList.contains('open'));
        });

        // Following a link, tapping outside, or pressing Escape closes the menu.
        nav.addEventListener('click', function (event) {
            if (event.target.closest('a')) setOpen(false);
        });
        document.addEventListener('pointerdown', function (event) {
            if (!nav.classList.contains('open')) return;
            if (nav.contains(event.target) || btn.contains(event.target)) return;
            setOpen(false);
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && nav.classList.contains('open')) {
                setOpen(false);
                btn.focus();
            }
        });
    });
})();

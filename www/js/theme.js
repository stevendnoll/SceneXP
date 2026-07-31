// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * theme.js - light/dark/system theme for the base SceneXP.com pages.
 *
 * Loaded synchronously in <head> (it is tiny) so the saved preference is
 * applied before first paint and there is no theme flash. The stylesheet
 * defaults to the system preference via prefers-color-scheme, so with
 * JavaScript off the site still follows the visitor's system. An explicit
 * choice sets data-theme="light|dark" on <html>, which the CSS lets win.
 *
 * data-theme-pref ("light" | "dark" | "system") is also set on <html> so the
 * CSS can show the matching icon inside the header toggle button. The button
 * ships hidden and is only revealed here, keeping it out of no-JS layouts.
 */
(function () {
    'use strict';

    var KEY = 'scenexp-theme';
    var ORDER = ['system', 'light', 'dark'];
    var LABELS = { system: 'System', light: 'Light', dark: 'Dark' };
    var root = document.documentElement;

    function storedPref() {
        try {
            var v = localStorage.getItem(KEY);
            return (v === 'light' || v === 'dark') ? v : 'system';
        } catch (e) {
            return 'system';
        }
    }

    function apply(pref) {
        if (pref === 'light' || pref === 'dark') {
            root.setAttribute('data-theme', pref);
        } else {
            root.removeAttribute('data-theme');
        }
        root.setAttribute('data-theme-pref', pref);
    }

    function describe(btn, pref) {
        var label = 'Theme: ' + LABELS[pref] + '. Activate to change.';
        btn.setAttribute('aria-label', label);
        btn.title = 'Theme: ' + LABELS[pref];
    }

    // Apply immediately, before first paint.
    apply(storedPref());

    document.addEventListener('DOMContentLoaded', function () {
        var btn = document.getElementById('theme-toggle');
        if (!btn) return;

        btn.hidden = false;
        describe(btn, storedPref());

        btn.addEventListener('click', function () {
            var next = ORDER[(ORDER.indexOf(storedPref()) + 1) % ORDER.length];
            try {
                localStorage.setItem(KEY, next);
            } catch (e) {
                // Private mode or full storage: the choice still applies for
                // this page view, it just will not persist.
            }
            apply(next);
            describe(btn, next);
        });
    });
})();

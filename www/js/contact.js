// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * contact.js - reveals the contact email behind a small proof of work.
 *
 * The address never appears in the HTML, and it is stored below in pieces so
 * a scraper grepping source files for email patterns finds nothing. Before
 * the mailto link is shown, the browser must solve the shared engine's
 * proof-of-work puzzle (see shared/js/boot: hash `${seed}:${nonce}` with
 * SHA-256 until the digest starts with PREFIX). A real visitor clears the
 * 12-bit target well under a second, while basic scrapers that do not run
 * JavaScript never see an address at all. Like the engine's gate, this is a
 * soft deterrent, not access control.
 *
 * Loaded as <script type="module">, so it runs after the document parses.
 */
import { getProofOfWork } from '../shared/js/boot-1.0.0.min.js';

// ~1-in-4096 hex target: a few thousand hashes, imperceptible for visitors.
const PREFIX = '000';
const STORAGE_KEY = 'scenexp-contact-pow';

// The address, assembled only after the proof is solved. It lives at the
// LLC's domain (scenexp.com has no mailboxes), which the note under the
// Direct email heading explains to visitors.
const ADDRESS_PARTS = [['sup', 'port'], ['contin', 'uumcom', 'mercellc'], ['c', 'om']];

function assembleAddress() {
    const joined = ADDRESS_PARTS.map((part) => part.join(''));
    return joined[0] + '@' + joined[1] + '.' + joined[2];
}

async function reveal() {
    const box = document.getElementById('contact-reveal');
    const status = document.getElementById('contact-reveal-status');
    const target = document.getElementById('contact-reveal-link');
    if (!box || !status || !target) return;

    box.hidden = false;
    status.textContent = 'One moment please, preparing a direct line to your host.';

    let proof = null;
    try {
        proof = await getProofOfWork({ prefix: PREFIX, storageKey: STORAGE_KEY });
    } catch (e) {
        proof = null;
    }

    if (!proof) {
        // No crypto.subtle (this needs https or localhost) or the solver hit
        // its safety cap. Leave a graceful explanation rather than a dead end.
        status.textContent = 'The email address could not be prepared in this '
            + 'browser. Please visit over a secure connection (https) and it '
            + 'will appear here.';
        return;
    }

    const address = assembleAddress();
    const link = document.createElement('a');
    // The Ref is the first 6 hex chars of the solved proof's hash: a mail
    // arriving with a valid-looking Ref demonstrably came through a browser
    // that solved the gate, which helps triage the inbox.
    link.href = 'mailto:' + address + '?subject='
        + encodeURIComponent('A custom 3D experience (Ref ' + proof.hash.slice(0, 6) + ')');
    link.textContent = address;

    target.textContent = '';
    target.appendChild(link);
    status.textContent = 'Thank you for waiting. This address goes straight '
        + 'to the developer.';
}

// In the browser this runs on load. Under Node (the test suite) there is no
// document, so the module stays import-safe and the tests drive reveal().
if (typeof document !== 'undefined') reveal();

// Exposed for the unit tests only.
export const __test__ = { PREFIX, STORAGE_KEY, assembleAddress, reveal };

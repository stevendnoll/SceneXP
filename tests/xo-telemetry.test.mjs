// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-telemetry.test.mjs - the shape of what X's and O's sends to the usage log.
 *
 * The production log keeps twelve named fields and drops everything else
 * (specs/nginx-config.txt), so the 2D game's play record rides as ONE query
 * string in `outcome`. These pin the parts of that which would fail silently:
 * a field quietly dropped from the string, a fingerprinting field carried over
 * from the 2D game, and a throttle that either lets a burst through to the rate
 * limit or swallows the actions that must always be sent.
 *
 * The end-to-end half, which captures the real beacons across a whole play, is
 * in xo-init.test.mjs, because that is the file that can boot the page.
 */
import { jest } from '@jest/globals';

let T;

beforeEach(async () => {
    jest.resetModules();
    T = await import('../www/xo/js/telemetry.js');
});

describe('the outcome string', () => {
    test('is a query string in the order given, decoded back exactly', () => {
        const s = T.outcomeString({ defense: 'cover3', offense: 'pass2', points: 15, muted: true });
        expect(s).toBe('defense=cover3&offense=pass2&points=15&muted=true');
        expect(Object.fromEntries(new URLSearchParams(s)))
            .toEqual({ defense: 'cover3', offense: 'pass2', points: '15', muted: 'true' });
    });

    test('keeps a false and a zero, and skips what has nothing to say', () => {
        // "muted=false" and "points=0" are answers. An incompletion is worth
        // nothing and a visitor with the sound on is not muted, and a string
        // that dropped both would make every one of them look unrecorded.
        const s = T.outcomeString({ points: 0, muted: false, throwTo: '', repeat: undefined, x: null });
        expect(s).toBe('points=0&muted=false');
    });

    test('survives being sent as one parameter of another query string', () => {
        // Which is exactly what happens to it: the shared part puts it inside
        // the beacon's own URLSearchParams. One decode gets it back.
        const inner = T.outcomeString({ result: 'run-50', offense: 'jumbo1' });
        const outer = new URLSearchParams({ action: 'play-result', outcome: inner }).toString();
        expect(outer).not.toContain('&offense=');
        expect(new URLSearchParams(outer).get('outcome')).toBe(inner);
    });
});

describe('the play record', () => {
    const play = {
        defense: 'cover3', offense: 'pass2', orientation: 'landscape', points: 15,
        result: 'catch', throwTo: 'wr3', currentScore: 15, playCount: 1, muted: true, games: 0,
    };

    test('carries the 2D game\'s fields in the 2D game\'s order', () => {
        // The legacy call this replaces:
        // defense, offense, orientation, points, result, throwTo, currentScore,
        // playCount, muted, games (then width, height, t, which are not ported).
        expect(Object.keys(T.playRecord(play))).toEqual([
            'defense', 'offense', 'orientation', 'points', 'result', 'throwTo',
            'currentScore', 'playCount', 'muted', 'games',
        ]);
    });

    test('never carries the window size or a timestamp', () => {
        // The exact window size is a fingerprinting signal and the privacy
        // policy promises none. nginx stamps the time itself.
        const s = T.outcomeString(T.playRecord({ ...play, width: 1048, height: 963, t: 1 }));
        for (const key of ['width', 'height', 't']) {
            expect({ key, present: new URLSearchParams(s).has(key) }).toEqual({ key, present: false });
        }
    });

    test('says when a sack was the play clock, and only then', () => {
        expect(T.playRecord({ ...play, result: 'sack', expired: true }).expired).toBe(true);
        expect('expired' in T.playRecord({ ...play, result: 'sack' })).toBe(false);
    });
});

describe('the beacon parameters', () => {
    test('only the fields the log keeps, each only when it has something in it', () => {
        expect(T.beaconParams({})).toEqual({});
        const p = T.beaconParams({ kind: 'catch', outcome: { points: 15 }, seconds: 2.345 });
        expect(p).toEqual({ kind: 'catch', outcome: 'points=15', seconds: '2.3' });
        // The log format's twelve fields, of which a scene sets these three.
        for (const key of Object.keys(p)) expect(['kind', 'outcome', 'seconds']).toContain(key);
    });

    test('an empty outcome is left out rather than sent blank', () => {
        expect(T.beaconParams({ kind: 'on', outcome: {} })).toEqual({ kind: 'on' });
    });
});

describe('the throttle', () => {
    test('a view switch is reported at most once a second', () => {
        const sent = new Map();
        expect(T.mayReport('switch-view', 1000, sent)).toBe(true);
        expect(T.mayReport('switch-view', 1400, sent)).toBe(false);
        expect(T.mayReport('switch-view', 1999, sent)).toBe(false);
        expect(T.mayReport('switch-view', 2000, sent)).toBe(true);
    });

    test('and the moments that matter are never throttled', () => {
        // A throttle that caught these would lose plays from the record, which
        // is the whole point of the record.
        const sent = new Map();
        for (const action of ['snap', 'throw', 'play-result', 'call-play']) {
            expect(T.mayReport(action, 5000, sent)).toBe(true);
            expect(T.mayReport(action, 5001, sent)).toBe(true);
        }
    });

    test('throttles each action on its own clock', () => {
        const sent = new Map();
        expect(T.mayReport('switch-view', 0, sent)).toBe(true);
        expect(T.mayReport('sound', 10, sent)).toBe(true);
    });
});

test('orientation is landscape unless the screen is taller than it is wide', () => {
    expect(T.orientationOf(1048, 963)).toBe('landscape');
    expect(T.orientationOf(800, 800)).toBe('landscape');
    expect(T.orientationOf(390, 844)).toBe('portrait');
});

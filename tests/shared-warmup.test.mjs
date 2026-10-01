// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The shared warmup part (www/shared/js/warmup-1.0.0.js): compiling a scene's
 * shaders behind the loading screen.
 *
 * Its one promise beyond compiling is that it never holds up the page, so
 * most of this suite is the ways it can go wrong: no compileAsync, a compile
 * that throws, and one that never finishes. And Corner Office draws its city
 * with tone mapping off and its room with ACES, so a pass must compile under
 * its own tone mapping and the renderer must be left as it was found.
 *
 * Every scene that should call it does: the last test reads each WebGL
 * scene's main.js, so a new scene (or a refactor) that drops the call shows up
 * here rather than as a freeze on a phone.
 */
import { jest } from '@jest/globals';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const { warmShaders } = await import('../www/shared/js/warmup-1.0.0.js');

const ACES = 4;
const NONE = 0;

function recordingRenderer(compile = async () => {}) {
    const calls = [];
    const renderer = {
        toneMapping: ACES,
        compileAsync: jest.fn(async (scene, camera) => {
            calls.push({ scene, camera, toneMapping: renderer.toneMapping });
            await compile(scene, camera);
        })
    };
    return { renderer, calls };
}

const pass = (name) => ({ scene: { name }, camera: { name: `${name}-camera` } });

test('every pass compiles, in order, with its own camera', async () => {
    const { renderer, calls } = recordingRenderer();
    const result = await warmShaders(renderer, [pass('world'), pass('room')]);
    expect(result).toBe('compiled');
    expect(calls.map((c) => c.scene.name)).toEqual(['world', 'room']);
    expect(calls[1].camera.name).toBe('room-camera');
});

test('a pass compiles under its own tone mapping, and the renderer is left as it was found', async () => {
    const { renderer, calls } = recordingRenderer();
    await warmShaders(renderer, [{ ...pass('world'), toneMapping: NONE }, pass('room')]);
    expect(calls[0].toneMapping).toBe(NONE);
    expect(calls[1].toneMapping).toBe(ACES);
    expect(renderer.toneMapping).toBe(ACES);
});

test('passes without a scene or camera are skipped, and nothing to do is a skip', async () => {
    const { renderer, calls } = recordingRenderer();
    expect(await warmShaders(renderer, [{ scene: null, camera: {} }, pass('room')])).toBe('compiled');
    expect(calls).toHaveLength(1);
    expect(await warmShaders(renderer, [])).toBe('skipped');
    expect(await warmShaders(renderer, null)).toBe('skipped');
});

test('a renderer without compileAsync is a skip, not an error', async () => {
    expect(await warmShaders({}, [pass('room')])).toBe('skipped');
    expect(await warmShaders(null, [pass('room')])).toBe('skipped');
});

test('a compile that throws never stops the page, and the tone mapping is put back', async () => {
    const { renderer } = recordingRenderer(async () => { throw new Error('link failed'); });
    await expect(warmShaders(renderer, [{ ...pass('world'), toneMapping: NONE }])).resolves.toBe('failed');
    expect(renderer.toneMapping).toBe(ACES);
});

test('a compile that never finishes is given up on after the timeout', async () => {
    jest.useFakeTimers();
    try {
        const { renderer } = recordingRenderer(() => new Promise(() => {}));
        const result = warmShaders(renderer, [pass('room')], { timeoutMs: 1000 });
        await jest.advanceTimersByTimeAsync(1001);
        await expect(result).resolves.toBe('timed-out');
    } finally {
        jest.useRealTimers();
    }
});

test('every WebGL scene warms its shaders before it starts drawing', async () => {
    const www = new URL('../www/', import.meta.url);
    const missing = [];
    let scenes = 0;
    for (const entry of await readdir(www, { withFileTypes: true })) {
        const main = new URL(`${entry.name}/js/main.js`, www);
        if (!entry.isDirectory() || !existsSync(main)) continue;
        const html = await readFile(new URL(`${entry.name}/index.html`, www), 'utf8');
        // The WebGPU scenes compile through their own renderer (compileAsync
        // on WebGPURenderer), which is not this part's business.
        if (html.includes('three.webgpu.min.js')) continue;
        scenes++;
        const src = await readFile(main, 'utf8');
        if (!/await warmShaders\(/.test(src)) missing.push(entry.name);
    }
    expect(scenes).toBeGreaterThanOrEqual(17);
    expect(missing).toEqual([]);
});

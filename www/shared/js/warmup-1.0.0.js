// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * warmup.js - Compile a scene's shaders behind the loading screen (shared
 * engine part).
 *
 * WebGL builds a material's shader program the first time that material is
 * drawn, and it blocks the page while it does. A scene with shadows, fog and
 * a few dozen material variants spends hundreds of milliseconds there, more
 * on a phone, and it all lands on the first frame, which is exactly when the
 * loading screen has just stepped aside. The visitor sees the scene, then a
 * freeze.
 *
 * warmShaders() asks three to build every program up front instead
 * (renderer.compileAsync). Where the browser can compile in parallel
 * (KHR_parallel_shader_compile, in most desktop browsers) the page keeps
 * running while it happens. Elsewhere it is the same work, done while the
 * loading screen is still up rather than after it has gone.
 *
 * Call it at the very end of a scene's init, once everything that will be
 * drawn is in the scene, and before the loading screen hides and the loop
 * starts. A light added afterwards changes every lit program, and they would
 * all be built again on the first frame anyway.
 *
 * A PASS IS A SCENE, ITS CAMERA, AND ITS TONE MAPPING. Tone mapping is part of
 * a program's identity, so a scene drawn with tone mapping switched off (Corner
 * Office's city outside) must be compiled the same way or the work is wasted.
 * Programs used only inside render targets (mirrors, picture-in-picture),
 * hidden objects, and shadow-map depth programs still compile when first
 * drawn. This covers what the first frame draws, which is the freeze people
 * see.
 *
 * IT NEVER HOLDS UP THE PAGE. A renderer without compileAsync, a compile that
 * throws, or one that takes longer than `timeoutMs` all simply return, and
 * the first frame compiles whatever is left the usual way.
 */

/**
 * Compile every pass's shaders. Resolves to 'compiled', 'timed-out',
 * 'failed' or 'skipped', for a log line or a test, and never rejects.
 * @param {object} renderer - a THREE.WebGLRenderer
 * @param {Array<{scene, camera, toneMapping?}>} passes - in draw order
 * @param {{timeoutMs?: number}} [options]
 */
export async function warmShaders(renderer, passes, { timeoutMs = 4000 } = {}) {
    if (!renderer || typeof renderer.compileAsync !== 'function') return 'skipped';
    const list = (passes || []).filter((p) => p && p.scene && p.camera);
    if (!list.length) return 'skipped';

    const toneMappingWas = renderer.toneMapping;
    let timer = null;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve('timed-out'), timeoutMs);
    });
    const compile = (async () => {
        for (const pass of list) {
            if (pass.toneMapping !== undefined) renderer.toneMapping = pass.toneMapping;
            await renderer.compileAsync(pass.scene, pass.camera);
            renderer.toneMapping = toneMappingWas;
        }
        return 'compiled';
    })();

    try {
        return await Promise.race([compile, timeout]);
    } catch (e) {
        return 'failed';
    } finally {
        clearTimeout(timer);
        renderer.toneMapping = toneMappingWas;
        // A compile still running after a timeout finishes on its own, and
        // an error from it is nobody's business but the first frame's.
        compile.catch(() => {});
    }
}

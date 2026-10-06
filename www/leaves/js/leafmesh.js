// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * leafmesh.js - every leaf in the yard, drawn as one instanced mesh.
 *
 * ---- ONE DRAW FOR THE WHOLE YARD ----
 *
 * Each leaf is a small cupped card (six vertices, four triangles) cut to a
 * leaf's outline by an alpha test. The outlines are four kinds drawn once on
 * a canvas (maple, oak, birch and elm, in a 2 by 2 atlas), white with faint
 * veins, so each leaf's own color does the work. Per leaf, the GPU gets
 * where it is and how it is turned (six floats from sim.pose, uploaded only
 * where the sim says they changed) and its look (color, kind, size and cup,
 * uploaded once).
 *
 * ---- LIT AND SHADOWED LIKE EVERYTHING ELSE ----
 *
 * The material is three's Lambert, patched so the vertex stage places each
 * card itself. The shadow pass runs a depth material with the same patch, or
 * the leaves would cast the shadow of one card at the origin. A leaf's
 * underside is paler and duller than its face, as real ones are.
 *
 * No backticks in the GLSL comments: the shader sources are template
 * literals, and a backtick ends one.
 */

import { dirtyRange, clearDirty } from './sim.min.js';

/** The four leaf kinds, in the atlas's order (and LEAVES_CONFIG.look.palettes's). */
export const KINDS = ['maple', 'oak', 'birch', 'elm'];

/**
 * One leaf card: a 3 by 2 grid of vertices lying in the xz plane, facing +y,
 * one unit long (stem at -z, tip at +z) and one unit wide. The middle column
 * lets the shader cup it.
 */
export function leafGeometry() {
    const position = new Float32Array([
        -0.5, 0, -0.5, 0, 0, -0.5, 0.5, 0, -0.5,
        -0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0.5
    ]);
    const normal = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
    const uv = new Float32Array([0, 0, 0.5, 0, 1, 0, 0, 1, 0.5, 1, 1, 1]);
    // Wound so the face toward +y is the front face.
    const index = new Uint16Array([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5]);
    return { position, normal, uv, index };
}

// ---- The outlines ----------------------------------------------------------

/** A leaf outline as points round a unit square cell (x right, y down, the
 *  stem at the bottom middle). Pure, so the shapes are tested off-screen. */
export function leafOutline(kind, steps = 96) {
    const pts = [];
    if (kind === 'maple') {
        // Five lobes round a center low in the cell, each tip a point,
        // with shallow teeth along the lobes and deep notches between them.
        const cx = 0.5;
        const cy = 0.6;
        const tips = [
            { a: 0, r: 0.5 }, { a: 0.85, r: 0.44 }, { a: 1.7, r: 0.3 },
            { a: -1.7, r: 0.3 }, { a: -0.85, r: 0.44 }
        ].sort((p, q) => p.a - q.a);
        for (let s = 0; s < steps; s++) {
            const a = -Math.PI + (s / steps) * Math.PI * 2;
            let r = 0.13;
            for (const t of tips) {
                const d = Math.abs(a - t.a);
                const lobe = Math.max(0, 1 - d / 0.42);
                r = Math.max(r, 0.13 + (t.r - 0.13) * Math.pow(lobe, 1.6));
            }
            r *= 1 + 0.05 * Math.sin(a * 23);
            pts.push([cx + Math.sin(a) * r, cy - Math.cos(a) * r]);
        }
        return pts;
    }
    // The others are drawn along the midrib, base (t = 0) to tip (t = 1),
    // with a half-width for each kind.
    const half = {
        // Rounded lobes, widest past the middle.
        oak: (t) => 0.2 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.7)
            * (0.62 + 0.38 * Math.abs(Math.sin(t * Math.PI * 4.5))),
        // A rounded ovate with fine teeth.
        birch: (t) => 0.3 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.85)
            * (1 + 0.06 * Math.abs(Math.sin(t * 60))),
        // Long, pointed, and serrated.
        elm: (t) => 0.24 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 1.1)
            * (1 + 0.08 * Math.abs(Math.sin(t * 44)))
    }[kind];
    const base = 0.9;
    const tip = 0.06;
    const n = steps / 2;
    for (let s = 0; s <= n; s++) {
        const t = s / n;
        pts.push([0.5 + half(t), base + (tip - base) * t]);
    }
    for (let s = n; s >= 0; s--) {
        const t = s / n;
        pts.push([0.5 - half(t) * 0.94, base + (tip - base) * t]);
    }
    return pts;
}

/** Draw the four kinds into a 2 by 2 atlas: white, with darker veins and a
 *  short stem. Returns the canvas, or null where there is no 2D canvas. */
export function drawAtlas(size = 256) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    const cell = size / 2;
    ctx.clearRect(0, 0, size, size);
    KINDS.forEach((kind, k) => {
        // Kind k sits at column k % 2 and row k / 2 counted from the BOTTOM,
        // since the texture is flipped on upload (v = 0 is the canvas foot).
        const ox = (k % 2) * cell;
        const oy = (1 - Math.floor(k / 2)) * cell;
        const pad = cell * 0.04;
        const scale = cell - pad * 2;
        const at = ([x, y]) => [ox + pad + x * scale, oy + pad + y * scale];

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        leafOutline(kind).forEach((p, i) => {
            const [x, y] = at(p);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();

        // The stem.
        ctx.strokeStyle = 'rgba(205,195,180,1)';
        ctx.lineWidth = Math.max(1.5, cell * 0.025);
        ctx.beginPath();
        const foot = kind === 'maple' ? 0.6 : 0.9;
        let [sx, sy] = at([0.5, foot]);
        ctx.moveTo(sx, sy);
        [sx, sy] = at([0.5, 0.98]);
        ctx.lineTo(sx, sy);
        ctx.stroke();

        // The veins: a midrib, and a few side veins, a shade darker so they
        // read through the leaf's color without breaking its outline.
        ctx.strokeStyle = 'rgba(214,206,196,1)';
        ctx.lineWidth = Math.max(1, cell * 0.012);
        ctx.beginPath();
        if (kind === 'maple') {
            const [cx, cy] = at([0.5, 0.6]);
            [0, 0.85, 1.7, -1.7, -0.85].forEach((a) => {
                const r = a === 0 ? 0.42 : Math.abs(a) < 1 ? 0.36 : 0.24;
                const [tx, ty] = at([0.5 + Math.sin(a) * r, 0.6 - Math.cos(a) * r]);
                ctx.moveTo(cx, cy);
                ctx.lineTo(tx, ty);
            });
        } else {
            let [mx, my] = at([0.5, 0.9]);
            ctx.moveTo(mx, my);
            [mx, my] = at([0.5, 0.12]);
            ctx.lineTo(mx, my);
            for (let v = 1; v <= 5; v++) {
                const t = v / 6.5;
                const y = 0.9 + (0.06 - 0.9) * t;
                const reach = 0.16 * Math.sin(Math.PI * Math.min(1, t * 1.15));
                for (const side of [-1, 1]) {
                    const [ax, ay] = at([0.5, y]);
                    const [bx, by] = at([0.5 + side * reach, y - 0.1]);
                    ctx.moveTo(ax, ay);
                    ctx.lineTo(bx, by);
                }
            }
        }
        ctx.stroke();
    });
    return canvas;
}

// ---- The shader patch ---------------------------------------------------------

const VERTEX_HEAD = /* glsl */`
attribute vec4 iPos;
attribute vec2 iRot;
attribute vec4 iLook;
attribute vec2 iShape;
varying vec3 vLeafColor;
// The leaf's turn: yaw about y, then pitch about x, then roll about z.
mat3 leafBasis() {
    float cy = cos(iPos.w), sy = sin(iPos.w);
    float cp = cos(iRot.x), sp = sin(iRot.x);
    float cr = cos(iRot.y), sr = sin(iRot.y);
    mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
    mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
    mat3 rz = mat3(cr, sr, 0.0, -sr, cr, 0.0, 0.0, 0.0, 1.0);
    return ry * rx * rz;
}
`;

// The cup lifts the card's long edges: y = 4 cup x squared across a unit card.
const BEGIN_NORMAL = /* glsl */`
vec3 objectNormal = leafBasis() * normalize(vec3(-8.0 * iShape.y * position.x, 1.0, 0.0));
#ifdef USE_TANGENT
    vec3 objectTangent = vec3( tangent.xyz );
#endif
`;

// A leaf lying face down would push its cupped edges into the lawn, so it
// is raised by its cup.
const BEGIN_VERTEX = /* glsl */`
mat3 leafTurn = leafBasis();
vec3 transformed = vec3(position.x, 4.0 * iShape.y * position.x * position.x, position.z) * iShape.x;
transformed = leafTurn * transformed + iPos.xyz;
transformed.y += max(0.0, -leafTurn[1].y) * iShape.y * iShape.x;
vLeafColor = iLook.rgb;
`;

// Each kind's corner of the atlas.
const UV_VERTEX = /* glsl */`
#include <uv_vertex>
#ifdef USE_MAP
    vMapUv = (uv + vec2(mod(iLook.w, 2.0), floor(iLook.w * 0.5 + 0.01))) * 0.5;
#endif
`;

const FRAGMENT_HEAD = /* glsl */`
varying vec3 vLeafColor;
uniform float uUnderside;
`;

const COLOR_FRAGMENT = /* glsl */`
#include <color_fragment>
vec3 leafColor = vLeafColor;
if (!gl_FrontFacing) {
    float grey = dot(leafColor, vec3(0.3, 0.59, 0.11));
    leafColor = mix(leafColor, vec3(grey), 0.35) * uUnderside + 0.02;
}
diffuseColor.rgb *= leafColor;
`;

/** Patch a material's shaders to place leaf cards. `lit` adds the color and
 *  normal parts, which the depth material has no use for. */
export function patchLeafShader(shader, { lit = true, underside = 0.72 } = {}) {
    let vs = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
        .replace('#include <uv_vertex>', UV_VERTEX)
        .replace('#include <begin_vertex>', BEGIN_VERTEX);
    if (lit) vs = vs.replace('#include <beginnormal_vertex>', BEGIN_NORMAL);
    shader.vertexShader = vs;
    if (lit) {
        shader.uniforms.uUnderside = { value: underside };
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
            .replace('#include <color_fragment>', COLOR_FRAGMENT);
    }
    return shader;
}

// ---- The mesh -------------------------------------------------------------------

/**
 * The yard's leaves as one mesh over `sim`, colored by `look` (the six floats
 * a leaf that scatterLeaves returned). Returns { mesh, update(), dispose() }:
 * update() uploads whatever the sim has moved since the last call.
 */
export function createLeafMesh(sim, look, options = {}) {
    const g = leafGeometry();
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(g.position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(g.normal, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2));
    geometry.setIndex(new THREE.BufferAttribute(g.index, 1));

    const pose = new THREE.InstancedInterleavedBuffer(sim.pose, 6, 1);
    pose.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('iPos', new THREE.InterleavedBufferAttribute(pose, 4, 0));
    geometry.setAttribute('iRot', new THREE.InterleavedBufferAttribute(pose, 2, 4));
    const traits = new THREE.InstancedInterleavedBuffer(look, 6, 1);
    geometry.setAttribute('iLook', new THREE.InterleavedBufferAttribute(traits, 4, 0));
    geometry.setAttribute('iShape', new THREE.InterleavedBufferAttribute(traits, 2, 4));
    geometry.instanceCount = sim.count;

    const canvas = drawAtlas(options.atlasSize || 256);
    const map = canvas ? new THREE.CanvasTexture(canvas) : null;
    if (map) {
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = options.anisotropy || 4;
    }
    const alphaTest = options.alphaTest ?? 0.45;
    const underside = options.underside ?? 0.72;

    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, map, alphaTest, side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => patchLeafShader(shader, { lit: true, underside });
    material.customProgramCacheKey = () => 'leaves-lit';

    const depth = new THREE.MeshDepthMaterial({ map, alphaTest, side: THREE.DoubleSide });
    depth.onBeforeCompile = (shader) => patchLeafShader(shader, { lit: false });
    depth.customProgramCacheKey = () => 'leaves-depth';

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'leaves';
    mesh.frustumCulled = false;
    mesh.castShadow = Boolean(options.shadows);
    mesh.receiveShadow = Boolean(options.shadows);
    mesh.customDepthMaterial = depth;

    let uploaded = 0;
    function update() {
        const range = dirtyRange(sim);
        clearDirty(sim);
        if (!range) return 0;
        pose.clearUpdateRanges();
        pose.addUpdateRange(range.from * 6, (range.to - range.from) * 6);
        pose.needsUpdate = true;
        uploaded = range.to - range.from;
        return uploaded;
    }

    function dispose() {
        geometry.dispose();
        material.dispose();
        depth.dispose();
        if (map) map.dispose();
    }

    return { mesh, material, depth, update, dispose, lastUpload: () => uploaded };
}

// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * textures.js - Procedural canvas textures (shared engine part)
 *
 * Pure builders: each returns a THREE.CanvasTexture and touches no world
 * state. Experiences call these while building their materials.
 */

/**
 * Light gray ceramic tile with grout lines for the customer waiting room.
 */
export function createTileFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Grout base
    ctx.fillStyle = '#9b9b94';
    ctx.fillRect(0, 0, 512, 512);

    // Tiles (4x4 per texture repeat)
    const tileSize = 128;
    const grout = 5;
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            const shade = 214 + Math.random() * 18 - 9;
            ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade - 6})`;
            ctx.fillRect(
                col * tileSize + grout / 2,
                row * tileSize + grout / 2,
                tileSize - grout,
                tileSize - grout
            );
            // Slight per-tile mottling
            for (let i = 0; i < 8; i++) {
                ctx.fillStyle = `rgba(120, 120, 112, ${Math.random() * 0.05})`;
                ctx.fillRect(
                    col * tileSize + grout + Math.random() * (tileSize - 24),
                    row * tileSize + grout + Math.random() * (tileSize - 24),
                    10 + Math.random() * 12,
                    10 + Math.random() * 12
                );
            }
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(5, 9);

    return texture;
}

/**
 * Working concrete for the garage: gray noise, hairline cracks, faint oil
 * stains, and a pair of yellow bay guide stripes.
 */
export function createConcreteFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base slab
    ctx.fillStyle = '#7d7f7c';
    ctx.fillRect(0, 0, 512, 512);

    // Aggregate noise
    for (let i = 0; i < 4200; i++) {
        const shade = Math.random();
        ctx.fillStyle = shade < 0.5
            ? `rgba(50, 52, 50, ${0.04 + Math.random() * 0.08})`
            : `rgba(190, 192, 188, ${0.04 + Math.random() * 0.07})`;
        const s = 1 + Math.random() * 2;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
    }

    // Faint oil stains
    for (let i = 0; i < 7; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const r = 18 + Math.random() * 42;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(28, 26, 22, 0.22)');
        g.addColorStop(0.7, 'rgba(28, 26, 22, 0.08)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Hairline cracks
    ctx.strokeStyle = 'rgba(40, 42, 40, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
        let x = Math.random() * 512;
        let y = Math.random() * 512;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let seg = 0; seg < 6; seg++) {
            x += (Math.random() - 0.5) * 90;
            y += (Math.random() - 0.5) * 90;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // Yellow bay guide stripes running the length of the texture
    ctx.fillStyle = 'rgba(226, 191, 62, 0.75)';
    ctx.fillRect(150, 0, 10, 512);
    ctx.fillRect(352, 0, 10, 512);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 3);

    return texture;
}

/**
 * Create procedural stucco texture: the shop's weathered beige/cream render.
 * Dense low-alpha speckle for the sand-float finish, a few soft trowel
 * blotches, and faint darker weathering toward the bottom edge.
 */
export function createStuccoTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base render color (aged beige)
    ctx.fillStyle = '#e6dcc4';
    ctx.fillRect(0, 0, 512, 512);

    // Sand-float speckle
    for (let i = 0; i < 5200; i++) {
        const shade = Math.random();
        ctx.fillStyle = shade < 0.5
            ? `rgba(120, 108, 84, ${0.04 + Math.random() * 0.08})`
            : `rgba(255, 250, 236, ${0.05 + Math.random() * 0.09})`;
        const s = 1 + Math.random() * 2;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
    }

    // Soft trowel blotches (broad tonal variation)
    for (let i = 0; i < 14; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const r = 40 + Math.random() * 90;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const dark = Math.random() < 0.5;
        g.addColorStop(0, dark ? 'rgba(150, 136, 106, 0.10)' : 'rgba(244, 238, 220, 0.12)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Faint weathering streaks near the bottom edge
    for (let i = 0; i < 26; i++) {
        const x = Math.random() * 512;
        const w = 6 + Math.random() * 18;
        const h = 30 + Math.random() * 80;
        ctx.fillStyle = `rgba(96, 86, 66, ${0.03 + Math.random() * 0.05})`;
        ctx.fillRect(x, 512 - h, w, h);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);

    return texture;
}

/**
 * Create procedural wood floor texture
 */
export function createWoodFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base wood color
    ctx.fillStyle = '#8B7355';
    ctx.fillRect(0, 0, 512, 512);

    // Draw wood planks
    const plankWidth = 64;

    for (let i = 0; i < 8; i++) {
        const x = i * plankWidth;

        // Vary plank color
        const baseColor = 139 + Math.random() * 30 - 15;
        ctx.fillStyle = `rgb(${baseColor}, ${baseColor * 0.8}, ${baseColor * 0.6})`;
        ctx.fillRect(x + 1, 0, plankWidth - 2, 512);

        // Add wood grain
        ctx.strokeStyle = `rgba(0, 0, 0, 0.1)`;
        ctx.lineWidth = 1;

        for (let j = 0; j < 20; j++) {
            const grainY = Math.random() * 512;
            ctx.beginPath();
            ctx.moveTo(x + 2, grainY);
            ctx.lineTo(x + plankWidth - 2, grainY + (Math.random() * 10 - 5));
            ctx.stroke();
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 10);

    return texture;
}

// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * wind.js - the tornado's wind, as the props feel it.
 *
 * The trees, the flowers, the pond and the windmill all ask one question:
 * which way, and how hard, is the air moving where I stand? This answers it,
 * as a pure function of where and of the tornado's state at this second, so
 * it is the same answer for a seek as for an untouched watch.
 *
 * THREE TERMS. A breath of evening air that is always there, so nothing is
 * frozen at the start. An inflow toward the tornado that builds with the
 * storm (lifecycle.inflow): a supercell pulls warm air in along the ground
 * from miles around, which is why the wheat and the trees lean toward it.
 * And a vortex that is violent close in and nothing far away, falling off as
 * 1 / (1 + (d / r)^2), pulling in and spinning around the funnel.
 *
 * Magnitudes are on the garden's scale, which the shared trees were tuned
 * against: a garden storm is 0.72.
 */
import { TORNADO_CONFIG } from './config.min.js';
import { spineAt } from './funnel.min.js';

/**
 * The wind at ground point (x, z) for a funnelStateAt() state.
 * Returns { x, z, speed }.
 */
export function windAt(x, z, state, config = TORNADO_CONFIG) {
    const W = config.wind;
    const g = spineAt(0, state);
    const dx = g.x - x;
    const dz = g.z - z;
    const d = Math.max(Math.hypot(dx, dz), 1);
    const inX = dx / d;
    const inZ = dz / d;

    const inflow = W.inflow * state.inflow;
    const strength = Math.max(state.dust, state.extent * 0.6);
    const vortex = W.vortex * strength / (1 + (d / W.vortexRadius) ** 2);

    // Around the funnel: the inward direction turned a quarter.
    const tanX = -inZ;
    const tanZ = inX;
    let wx = W.ambient.x + inX * (inflow + vortex * W.inward) + tanX * vortex * W.swirl;
    let wz = W.ambient.z + inZ * (inflow + vortex * W.inward) + tanZ * vortex * W.swirl;

    const speed = Math.hypot(wx, wz);
    if (speed > W.max) {
        wx *= W.max / speed;
        wz *= W.max / speed;
    }
    return { x: wx, z: wz, speed: Math.min(speed, W.max) };
}

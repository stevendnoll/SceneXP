// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * lightning.js - High Water's lightning, which is the shared part
 * (shared/js/lightning-1.0.0.js) bound to this scene's config.
 *
 * PROMOTED ON 2026-09-23, so Tornado Alley could have the same streaks. The
 * code, and every note about why it is the way it is (the flash-rate cap for
 * photosensitive viewers above all), moved to the shared part unchanged. What
 * is left here is only the binding: the shared part takes its settings as an
 * argument, and this scene's callers and tests have always relied on
 * OCEAN_CONFIG being the default. So every function keeps exactly the
 * signature and the defaults it had, and hands them straight through.
 *
 * A frame-by-frame comparison against the old copy (flash level, flash
 * direction, the light, and every bolt buffer, over the whole arc and a run of
 * forced strikes) showed High Water's lightning did not change.
 */

import { OCEAN_CONFIG } from './config.min.js';
import * as L from '../../shared/js/lightning-1.0.0.min.js';

export function strikeRateAt(seconds, config = OCEAN_CONFIG) {
    return L.strikeRateAt(seconds, config);
}

export function flashesPerSecondCeiling(config = OCEAN_CONFIG) {
    return L.flashesPerSecondCeiling(config);
}

export const visibleHalfAngleDegrees = L.visibleHalfAngleDegrees;

export function boltAzimuthLimit(aspect, config = OCEAN_CONFIG, fovDegrees = null) {
    return L.boltAzimuthLimit(aspect, config, fovDegrees);
}

export const drawStrikeThreshold = L.drawStrikeThreshold;
export const flashPulse = L.flashPulse;
export const flashLevelAt = L.flashLevelAt;

export function planStrike(now, lastFlashAt, random = Math.random,
    config = OCEAN_CONFIG, soft = false,
    limitDegrees = config.storm.lightning.boltAzimuthDegrees) {
    return L.planStrike(now, lastFlashAt, random, config, soft, limitDegrees);
}

export function strikeDirection(azimuth, distance, config = OCEAN_CONFIG) {
    return L.strikeDirection(azimuth, distance, config);
}

export function generateBolt(from, to, random = Math.random, config = OCEAN_CONFIG) {
    return L.generateBolt(from, to, random, config);
}

export function boltRibbon(segments, eye, positions, brights, powers, indices,
    config = OCEAN_CONFIG) {
    return L.boltRibbon(segments, eye, positions, brights, powers, indices, config);
}

export function strikeEndpoints(azimuth, distance, config = OCEAN_CONFIG) {
    return L.strikeEndpoints(azimuth, distance, config);
}

export function initLightning(scene, camera, config = OCEAN_CONFIG, options = {}) {
    return L.initLightning(scene, camera, config, options);
}

export const resetLightning = L.resetLightning;

export function updateLightning(seconds, config = OCEAN_CONFIG) {
    return L.updateLightning(seconds, config);
}

export const forceStrike = L.forceStrike;
export const disposeLightning = L.disposeLightning;

/** Test seam, as before. */
export const __lightning = L.__lightning;

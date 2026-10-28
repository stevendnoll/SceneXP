// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/index.js - the builders a cell may name as its `scene` (specs/meme
 * PLANNING 5.3): each puts a template's props and lights inside a shadowbox,
 * `build(box, config)`. A cell without props names none. Adding a template
 * with props is a builder here and a line in this map.
 */

import { build as plan } from './plan.min.js';

export const SCENES = Object.freeze({ plan });

export const SCENE_IDS = Object.freeze(Object.keys(SCENES));

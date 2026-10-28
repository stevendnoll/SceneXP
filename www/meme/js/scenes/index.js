// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/index.js - the builders a cell may name as its `scene` (specs/meme
 * PLANNING 5.3): each puts a template's props and lights inside a shadowbox,
 * `build(box, config, { figures, mobile })`, after the figures are built,
 * so a prop can be fitted to a figure (a helmet). A cell without props
 * names none. Adding a template with props is a builder here and a line
 * in this map. A builder's group may carry `userData.tick(dt)` for props
 * that move (the flames).
 */

import { build as plan } from './plan.min.js';
import { build as space } from './space.min.js';
import { build as fine } from './fine.min.js';

export const SCENES = Object.freeze({ plan, space, fine });

export const SCENE_IDS = Object.freeze(Object.keys(SCENES));

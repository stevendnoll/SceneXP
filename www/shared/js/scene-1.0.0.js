// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scene.js - Three.js Scene Setup (shared engine part)
 * Handles scene, camera, renderer initialization plus the sky: sun, moon,
 * stars, clouds, the day/night cycle, and the optional comet.
 *
 * Per-experience configuration is passed to initScene(canvas, options):
 *   dayNight: { enabled?: boolean, cycleDuration?: seconds }  (default: on, 480)
 *   comet:    { enabled?: boolean, base?: {x, y, z} }         (default: OFF)
 */

// Scene configuration
const SCENE_CONFIG = {
    backgroundColor: 0x87CEEB, // Sky blue
    fogColor: 0x87CEEB,
    fogNear: 40,
    fogFar: 200,
    cameraFov: 75,
    cameraNear: 0.1,
    cameraFar: 1000,
    eyeHeight: 1.7
};

// Scene elements
let scene = null;
let camera = null;
let renderer = null;
let cameraRig = null;
let cometGroup = null;

// Resting position of the distant comet (it sways gently around this point),
// high over the far side of the street. The comet is an optional flourish:
// disabled unless the experience opts in via initScene options, which may also
// override the base position (e.g. to line it up with a telescope prop).
const COMET_DEFAULT_BASE = { x: 60, y: 150, z: 130 };
let cometEnabled = false;
let cometBase = { ...COMET_DEFAULT_BASE };

// Day/night cycle runs by default; an experience can freeze the sky at noon.
let dayNightEnabled = true;

// Cached touch device detection (doesn't change at runtime)
let _isMobileCached = null;

// Day/Night cycle configuration
const DAY_NIGHT_CONFIG = {
    cycleDuration: 480,      // Full day/night cycle in seconds (8 minutes)
    sunDistance: 200,        // Distance of sun from origin
    moonDistance: 200,       // Distance of moon from origin
    starCount: 500,          // Number of stars
    sunriseStart: 0.20,      // Time when sunrise begins (0-1)
    sunriseEnd: 0.30,        // Time when sunrise ends
    sunsetStart: 0.70,       // Time when sunset begins
    sunsetEnd: 0.80          // Time when sunset ends
};

// Visitors who ask for reduced motion get a still scene: the day/night cycle is
// frozen at its starting point (noon) and the comet holds position, rather than
// running continuous, non-user-initiated motion they opted out of.
const _reducedMotion = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

// Day/Night cycle state
let cycleTime = 0.5;         // Start at noon (0 = midnight, 0.5 = noon, 1 = midnight)
let sunGroup = null;
let moonGroup = null;
let starsGroup = null;
let ambientLight = null;
let hemiLight = null;
let dirLight = null;
let skyMesh = null;
let skyCanvas = null;
let skyCtx = null;
let skyTexture = null;
let lastSkyUpdateTime = -1; // Force first update

// Pre-allocated Color objects for day/night transitions (avoids GC per frame)
const _colorA = new THREE.Color();
const _colorB = new THREE.Color();

/**
 * Check if device is mobile/touch device
 */
export function isTouchDevice() {
    return ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0) ||
           (navigator.msMaxTouchPoints > 0);
}

/**
 * Initialize the Three.js scene
 * @param {HTMLCanvasElement} canvas - The canvas element to render to
 * @param {Object} [options] - Per-experience config: { dayNight, comet }
 * @returns {Object} Scene components
 */
export function initScene(canvas, options = {}) {
    const dayNightOpts = options.dayNight || {};
    if (typeof dayNightOpts.cycleDuration === 'number' && dayNightOpts.cycleDuration > 0) {
        DAY_NIGHT_CONFIG.cycleDuration = dayNightOpts.cycleDuration;
    }
    dayNightEnabled = dayNightOpts.enabled !== false;

    const cometOpts = options.comet || {};
    cometEnabled = cometOpts.enabled === true;
    if (cometOpts.base) {
        cometBase = {
            x: cometOpts.base.x, y: cometOpts.base.y, z: cometOpts.base.z
        };
    }

    _isMobileCached = isTouchDevice();
    const isMobile = _isMobileCached;

    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(SCENE_CONFIG.backgroundColor);
    const fogFar = isMobile ? 120 : SCENE_CONFIG.fogFar;
    scene.fog = new THREE.Fog(
        SCENE_CONFIG.fogColor,
        SCENE_CONFIG.fogNear,
        fogFar
    );

    // Create camera
    camera = new THREE.PerspectiveCamera(
        SCENE_CONFIG.cameraFov,
        window.innerWidth / window.innerHeight,
        SCENE_CONFIG.cameraNear,
        SCENE_CONFIG.cameraFar
    );
    camera.position.set(0, SCENE_CONFIG.eyeHeight, 0);

    // Create camera rig for VR locomotion (camera is child of rig)
    cameraRig = new THREE.Group();
    cameraRig.name = 'cameraRig';
    cameraRig.add(camera);
    scene.add(cameraRig);

    // Create renderer with mobile optimizations
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: !isMobile, // Disable antialiasing on mobile for performance
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Cap pixel ratio at 1.5 on all devices. On Retina displays (devicePixelRatio
    // 2+) this roughly halves the fragment count of the main pass — the single
    // biggest perf win for a many-light scene — with minimal sharpness loss.
    const maxPixelRatio = 1.5;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = isMobile ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    // The sun moves slowly, so we don't need to regenerate the shadow map every
    // frame. We disable auto-update and refresh it on a throttle (see
    // updateDayNightCycle), which removes a full per-frame shadow render pass.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    // Enable WebXR for VR headset support (Meta Quest, etc.)
    renderer.xr.enabled = true;

    // Add basic lighting (with mobile-aware shadow settings)
    setupBasicLighting(isMobile, options.shadowRange);

    // Add sky dome with clouds
    createSkyDome();

    // Add test cube for verification
    addTestCube();

    return { scene, camera, renderer };
}

/**
 * Setup basic scene lighting (stores references for day/night cycle)
 * @param {boolean} isMobile - Whether device is mobile (for performance tuning)
 * @param {number} [shadowRange] - Half-extent of the sun's orthographic shadow
 *   box (default 30). Experiences with far-flung scenery can widen it via
 *   config.shadowRange, trading a little shadow resolution for coverage.
 */
function setupBasicLighting(isMobile = false, shadowRange = 30) {
    // Ambient light for base illumination
    ambientLight = new THREE.AmbientLight(0xfff8dc, 0.4);
    ambientLight.name = 'ambientLight';
    scene.add(ambientLight);

    // Hemisphere light for sky/ground gradient
    hemiLight = new THREE.HemisphereLight(0xfff8dc, 0x444444, 0.5);
    hemiLight.position.set(0, 20, 0);
    hemiLight.name = 'hemiLight';
    scene.add(hemiLight);

    // Directional light (sun) - position updated by day/night cycle
    dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;

    // Reduce shadow map size for better performance
    const shadowMapSize = isMobile ? 512 : 1024;
    dirLight.shadow.mapSize.width = shadowMapSize;
    dirLight.shadow.mapSize.height = shadowMapSize;

    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = shadowRange > 30 ? shadowRange * 2 : 50;
    dirLight.shadow.camera.left = -shadowRange;
    dirLight.shadow.camera.right = shadowRange;
    dirLight.shadow.camera.top = shadowRange;
    dirLight.shadow.camera.bottom = -shadowRange;
    dirLight.name = 'dirLight';
    scene.add(dirLight);
}

/**
 * Create a sky dome with gradient and clouds using a hemisphere
 */
function createSkyDome() {
    // Create a large sky hemisphere
    const skyRadius = 300;

    // Create sky gradient texture (store references for dynamic updates)
    skyCanvas = document.createElement('canvas');
    skyCanvas.width = 512;
    skyCanvas.height = 512;
    skyCtx = skyCanvas.getContext('2d');

    // Initial sky gradient (will be updated by day/night cycle)
    updateSkyGradient(0.25); // Start at morning

    skyTexture = new THREE.CanvasTexture(skyCanvas);

    // Create hemisphere geometry for sky
    const skyGeometry = new THREE.SphereGeometry(skyRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const skyMaterial = new THREE.MeshBasicMaterial({
        map: skyTexture,
        side: THREE.BackSide
    });

    skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    skyMesh.rotation.x = Math.PI; // Flip so gradient goes from horizon to zenith
    skyMesh.position.y = 0;
    skyMesh.name = 'sky';
    scene.add(skyMesh);

    // Add sun
    createSun();

    // Add moon
    createMoon();

    // Add stars (hidden during day)
    createStars();

    // Add 3D cloud meshes
    createClouds(skyRadius * 0.6);

    // Add the distant comet (visible day and night, never cloud-covered),
    // only when the experience opted in.
    if (cometEnabled) {
        createComet();
    }
}

/**
 * Create a sun in the sky (position updated by day/night cycle)
 */
function createSun() {
    sunGroup = new THREE.Group();
    sunGroup.name = 'sun';

    // Sun core - bright yellow/white (fog disabled so it's always visible)
    const sunRadius = 12;
    const sunGeometry = new THREE.SphereGeometry(sunRadius, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffd0,
        fog: false
    });
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.name = 'sunCore';
    sunGroup.add(sun);

    // Sun glow - larger, semi-transparent
    const glowRadius = sunRadius * 1.6;
    const glowGeometry = new THREE.SphereGeometry(glowRadius, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffdd44,
        transparent: true,
        opacity: 0.25,
        fog: false
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    sunGroup.add(glow);

    // Outer glow - even larger, more transparent
    const outerGlowRadius = sunRadius * 2.2;
    const outerGlowGeometry = new THREE.SphereGeometry(outerGlowRadius, 32, 32);
    const outerGlowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.12,
        fog: false
    });
    const outerGlow = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial);
    sunGroup.add(outerGlow);

    // Initial position (will be updated by day/night cycle)
    sunGroup.position.set(150, 120, 150);

    scene.add(sunGroup);
}

/**
 * Create a moon in the sky (visible at night, position updated by day/night cycle)
 */
function createMoon() {
    moonGroup = new THREE.Group();
    moonGroup.name = 'moon';

    // Moon core - plain white sphere
    const moonRadius = 6;
    const moonGeometry = new THREE.SphereGeometry(moonRadius, 32, 32);
    const moonMaterial = new THREE.MeshBasicMaterial({
        color: 0xe8e8f0,
        fog: false
    });
    const moon = new THREE.Mesh(moonGeometry, moonMaterial);
    moon.name = 'moonCore';
    moonGroup.add(moon);

    // Moon glow - subtle
    const glowRadius = moonRadius * 1.3;
    const glowGeometry = new THREE.SphereGeometry(glowRadius, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x8899aa,
        transparent: true,
        opacity: 0.12,
        fog: false
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    moonGroup.add(glow);

    // Initial position (opposite side of sun, will be updated by day/night cycle)
    moonGroup.position.set(-150, 120, -150);

    // Start hidden (will show at night)
    moonGroup.visible = false;

    scene.add(moonGroup);
}

/**
 * Create stars in the sky (visible at night)
 */
function createStars() {
    starsGroup = new THREE.Group();
    starsGroup.name = 'stars';

    const starCount = DAY_NIGHT_CONFIG.starCount;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);

    // Distribute stars across the sky dome
    for (let i = 0; i < starCount; i++) {
        // Random position on a sphere
        const theta = Math.random() * Math.PI * 2; // Azimuth
        const phi = Math.random() * Math.PI * 0.4; // Elevation (0-72 degrees from zenith)
        const radius = 280; // Just inside the sky dome

        starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        starPositions[i * 3 + 1] = radius * Math.cos(phi); // Y is up
        starPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

        // Random star sizes
        starSizes[i] = Math.random() * 2 + 1;
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));

    // Star material using points
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2,
        sizeAttenuation: false,
        fog: false,
        transparent: true,
        opacity: 0.9
    });

    const stars = new THREE.Points(starGeometry, starMaterial);
    starsGroup.add(stars);

    // Start hidden (will show at night)
    starsGroup.visible = false;

    scene.add(starsGroup);
}

/**
 * Create a distant comet: a bright bluish head with a faint tapering tail, set
 * high in the sky. Every material uses fog:false (so it reads against both the
 * pale daytime sky and the dark night sky) and depthTest:false with a high
 * renderOrder (so the drifting clouds can never cover it).
 */
function createComet() {
    cometGroup = new THREE.Group();
    cometGroup.name = 'comet';

    const headShell = (color, opacity, radius) => new THREE.Mesh(
        new THREE.SphereGeometry(radius, 24, 24),
        new THREE.MeshBasicMaterial({
            color, fog: false, transparent: true, opacity,
            depthWrite: false
        })
    );

    // Near-white core wrapped in two bluish glow shells.
    cometGroup.add(headShell(0xeaf4ff, 1.0, 2.6));
    cometGroup.add(headShell(0x8fc0ff, 0.40, 4.6));
    cometGroup.add(headShell(0x4f8dff, 0.18, 7.2));

    // Tapering tail: layered open cones, wide at the head and narrowing to a
    // point away from it (the classic comet silhouette).
    const tailDir = new THREE.Vector3(0.55, 1, 0.25).normalize();
    const addTail = (len, rad, color, opacity) => {
        const cone = new THREE.Mesh(
            new THREE.ConeGeometry(rad, len, 20, 1, true),
            new THREE.MeshBasicMaterial({
                color, fog: false, transparent: true, opacity,
                depthWrite: false, side: THREE.DoubleSide
            })
        );
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tailDir);
        cone.position.copy(tailDir.clone().multiplyScalar(len / 2));
        cometGroup.add(cone);
    };
    addTail(38, 5.2, 0x6ba8ff, 0.16);
    addTail(28, 3.0, 0xa9d4ff, 0.20);

    cometGroup.traverse((o) => { if (o.isMesh) o.renderOrder = 12; });
    cometGroup.position.set(cometBase.x, cometBase.y, cometBase.z);
    scene.add(cometGroup);
}

/** The comet group, for a (long-range) click test in main.js. Null when the
 *  experience did not enable the comet - callers must null-guard. */
export function getComet() {
    return cometGroup;
}

/** The comet's resting position, so an experience can aim props (like a
 *  telescope) at it without duplicating the coordinates. */
export function getCometBase() {
    return { ...cometBase };
}

/** The sun group, for a (long-range) click test in main.js. */
export function getSun() {
    return sunGroup;
}

/** The moon group, for a (long-range) click test in main.js. */
export function getMoon() {
    return moonGroup;
}

/** Drift the comet incredibly slowly so it feels alive but stays roughly put.
 *  No-ops when the comet is disabled. */
export function updateComet(elapsed) {
    if (!cometGroup) return;
    if (_reducedMotion.matches) {
        // Hold the comet still for reduced-motion users (matches elapsed = 0).
        cometGroup.position.set(cometBase.x, cometBase.y, cometBase.z + 12);
        return;
    }
    cometGroup.position.set(
        cometBase.x + Math.sin(elapsed * 0.02) * 12,
        cometBase.y + Math.sin(elapsed * 0.013) * 4,
        cometBase.z + Math.cos(elapsed * 0.018) * 12
    );
}

/**
 * Convert hex color to RGB (used once at init for pre-computation)
 */
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

// Pre-computed RGB values for sky gradient colors (avoids regex per frame)
const SKY_COLORS = {
    night0:    hexToRgb('#0a0a20'),
    night1:    hexToRgb('#101030'),
    night2:    hexToRgb('#151540'),
    day0:      hexToRgb('#1e90ff'),
    day1:      hexToRgb('#87CEEB'),
    day2:      hexToRgb('#B0E0E6'),
    day3:      hexToRgb('#E6F3FF'),
    sunrise0:  hexToRgb('#FFB366'),
    sunrise1:  hexToRgb('#FFD700'),
    sunset0:   hexToRgb('#FF6B4A'),
    sunset1:   hexToRgb('#FF8C00'),
};

/**
 * Lerp between two pre-computed RGB color objects and return CSS string
 */
function lerpColorRgb(c1, c2, t) {
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);
    return `rgb(${r},${g},${b})`;
}

/**
 * Update sky gradient based on time of day
 * Uses pre-computed color values to avoid hex parsing per update
 */
function updateSkyGradient(time) {
    if (!skyCtx || !skyCanvas) return;

    const gradient = skyCtx.createLinearGradient(0, 0, 0, skyCanvas.height);
    const C = SKY_COLORS;

    // time: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset, 1 = midnight
    if (time < DAY_NIGHT_CONFIG.sunriseStart) {
        // Night (before sunrise)
        gradient.addColorStop(0, '#0a0a20');
        gradient.addColorStop(0.5, '#101030');
        gradient.addColorStop(1, '#151540');
    } else if (time < DAY_NIGHT_CONFIG.sunriseEnd) {
        // Sunrise transition
        const t = (time - DAY_NIGHT_CONFIG.sunriseStart) / (DAY_NIGHT_CONFIG.sunriseEnd - DAY_NIGHT_CONFIG.sunriseStart);
        gradient.addColorStop(0, lerpColorRgb(C.night0, C.day0, t));
        gradient.addColorStop(0.4, lerpColorRgb(C.night1, C.day1, t));
        gradient.addColorStop(0.7, lerpColorRgb(C.night2, C.sunrise0, t));
        gradient.addColorStop(1, lerpColorRgb(C.night2, C.sunrise1, t));
    } else if (time < DAY_NIGHT_CONFIG.sunsetStart) {
        // Day
        gradient.addColorStop(0, '#1e90ff');
        gradient.addColorStop(0.4, '#87CEEB');
        gradient.addColorStop(0.7, '#B0E0E6');
        gradient.addColorStop(1, '#E6F3FF');
    } else if (time < DAY_NIGHT_CONFIG.sunsetEnd) {
        // Sunset transition
        const t = (time - DAY_NIGHT_CONFIG.sunsetStart) / (DAY_NIGHT_CONFIG.sunsetEnd - DAY_NIGHT_CONFIG.sunsetStart);
        gradient.addColorStop(0, lerpColorRgb(C.day0, C.night0, t));
        gradient.addColorStop(0.4, lerpColorRgb(C.day1, C.night1, t));
        gradient.addColorStop(0.7, lerpColorRgb(C.day2, C.sunset0, t));
        gradient.addColorStop(1, lerpColorRgb(C.day3, C.sunset1, t));
    } else {
        // Night (after sunset)
        gradient.addColorStop(0, '#0a0a20');
        gradient.addColorStop(0.5, '#101030');
        gradient.addColorStop(1, '#151540');
    }

    skyCtx.fillStyle = gradient;
    skyCtx.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
}

/**
 * Update day/night cycle - call this every frame with deltaTime
 */
let _shadowAccum = 0;
export function updateDayNightCycle(deltaTime) {
    // Advance time, unless the visitor asked for reduced motion or the
    // experience disabled the cycle: then the sky holds at its starting time
    // (noon) instead of cycling on its own. The first pass still runs below to
    // paint the sky/lighting for that fixed time.
    if (!_reducedMotion.matches && dayNightEnabled) {
        cycleTime += deltaTime / DAY_NIGHT_CONFIG.cycleDuration;
        if (cycleTime >= 1) cycleTime -= 1;
    }

    // Refresh the (auto-update-disabled) shadow map a few times per second rather
    // than every frame — the sun moves slowly so this is visually indistinguishable
    // but removes a full shadow render pass from most frames.
    _shadowAccum += deltaTime;
    if (renderer && _shadowAccum >= 0.33) {
        _shadowAccum = 0;
        renderer.shadowMap.needsUpdate = true;
    }

    // Calculate sun angle with proper phase offset
    // cycleTime 0.25 = sunrise (sun at horizon), 0.5 = noon (sun highest), 0.75 = sunset
    const sunAngle = (cycleTime - 0.25) * Math.PI * 2;

    // Update sun position (arc across the sky)
    if (sunGroup) {
        const sunDist = DAY_NIGHT_CONFIG.sunDistance;
        sunGroup.position.set(
            Math.cos(sunAngle) * sunDist * 0.5,   // X: east to west
            Math.sin(sunAngle) * sunDist,          // Y: up at noon, down at midnight
            -Math.cos(sunAngle) * sunDist * 0.3    // Z: slight depth variation
        );

        // Hide sun when below horizon (Y < 0)
        sunGroup.visible = sunGroup.position.y > -10;
    }

    // Update moon position (opposite of sun)
    if (moonGroup) {
        const moonDist = DAY_NIGHT_CONFIG.moonDistance;
        const moonAngle = sunAngle + Math.PI; // Opposite side
        moonGroup.position.set(
            Math.cos(moonAngle) * moonDist * 0.5,
            Math.sin(moonAngle) * moonDist,
            -Math.cos(moonAngle) * moonDist * 0.3
        );

        // Show moon when above horizon
        moonGroup.visible = moonGroup.position.y > -10;
    }

    // Update stars visibility (fade in/out)
    if (starsGroup) {
        const isNight = cycleTime < DAY_NIGHT_CONFIG.sunriseStart || cycleTime > DAY_NIGHT_CONFIG.sunsetEnd;
        const isTransition = (cycleTime >= DAY_NIGHT_CONFIG.sunriseStart && cycleTime < DAY_NIGHT_CONFIG.sunriseEnd) ||
                            (cycleTime >= DAY_NIGHT_CONFIG.sunsetStart && cycleTime < DAY_NIGHT_CONFIG.sunsetEnd);

        if (isNight) {
            starsGroup.visible = true;
            starsGroup.children[0].material.opacity = 0.9;
        } else if (isTransition) {
            starsGroup.visible = true;
            // Fade stars during transition
            if (cycleTime < DAY_NIGHT_CONFIG.sunriseEnd) {
                const t = (cycleTime - DAY_NIGHT_CONFIG.sunriseStart) / (DAY_NIGHT_CONFIG.sunriseEnd - DAY_NIGHT_CONFIG.sunriseStart);
                starsGroup.children[0].material.opacity = 0.9 * (1 - t);
            } else {
                const t = (cycleTime - DAY_NIGHT_CONFIG.sunsetStart) / (DAY_NIGHT_CONFIG.sunsetEnd - DAY_NIGHT_CONFIG.sunsetStart);
                starsGroup.children[0].material.opacity = 0.9 * t;
            }
        } else {
            starsGroup.visible = false;
        }
    }

    // Update sky gradient (throttled — ~2 updates/sec instead of every frame)
    if (Math.abs(cycleTime - lastSkyUpdateTime) > 0.001) {
        lastSkyUpdateTime = cycleTime;
        updateSkyGradient(cycleTime);
        if (skyTexture) {
            skyTexture.needsUpdate = true;
        }
    }

    // Update scene background and fog color based on time (reuse pre-allocated Color objects)
    const isNight = cycleTime < DAY_NIGHT_CONFIG.sunriseStart || cycleTime > DAY_NIGHT_CONFIG.sunsetEnd;
    if (scene) {
        if (isNight) {
            _colorA.setHex(0x0a0a20);
        } else if (cycleTime < DAY_NIGHT_CONFIG.sunriseEnd) {
            // Sunrise
            const t = (cycleTime - DAY_NIGHT_CONFIG.sunriseStart) / (DAY_NIGHT_CONFIG.sunriseEnd - DAY_NIGHT_CONFIG.sunriseStart);
            _colorA.setHex(0x0a0a20);
            _colorB.setHex(0x87CEEB);
            _colorA.lerp(_colorB, t);
        } else if (cycleTime < DAY_NIGHT_CONFIG.sunsetStart) {
            // Day
            _colorA.setHex(0x87CEEB);
        } else {
            // Sunset
            const t = (cycleTime - DAY_NIGHT_CONFIG.sunsetStart) / (DAY_NIGHT_CONFIG.sunsetEnd - DAY_NIGHT_CONFIG.sunsetStart);
            _colorA.setHex(0x87CEEB);
            _colorB.setHex(0x0a0a20);
            _colorA.lerp(_colorB, t);
        }
        scene.background.copy(_colorA);
        scene.fog.color.copy(_colorA);
    }

    // Update lighting intensity based on time
    updateLighting(cycleTime);

    // Update directional light position to follow sun
    if (dirLight && sunGroup) {
        dirLight.position.copy(sunGroup.position).normalize().multiplyScalar(20);
    }
}

/**
 * Update lighting based on time of day
 */
function updateLighting(time) {
    const isNight = time < DAY_NIGHT_CONFIG.sunriseStart || time > DAY_NIGHT_CONFIG.sunsetEnd;
    const isTransition = (time >= DAY_NIGHT_CONFIG.sunriseStart && time < DAY_NIGHT_CONFIG.sunriseEnd) ||
                        (time >= DAY_NIGHT_CONFIG.sunsetStart && time < DAY_NIGHT_CONFIG.sunsetEnd);

    let lightIntensity = 1;
    let ambientIntensity = 0.4;

    if (isNight) {
        lightIntensity = 0.1;
        ambientIntensity = 0.15;
    } else if (isTransition) {
        if (time < DAY_NIGHT_CONFIG.sunriseEnd) {
            const t = (time - DAY_NIGHT_CONFIG.sunriseStart) / (DAY_NIGHT_CONFIG.sunriseEnd - DAY_NIGHT_CONFIG.sunriseStart);
            lightIntensity = 0.1 + 0.7 * t;
            ambientIntensity = 0.15 + 0.25 * t;
        } else {
            const t = (time - DAY_NIGHT_CONFIG.sunsetStart) / (DAY_NIGHT_CONFIG.sunsetEnd - DAY_NIGHT_CONFIG.sunsetStart);
            lightIntensity = 0.8 - 0.7 * t;
            ambientIntensity = 0.4 - 0.25 * t;
        }
    }

    if (ambientLight) {
        ambientLight.intensity = ambientIntensity;
        // Warmer light at sunrise/sunset, cooler at night
        if (isNight) {
            ambientLight.color.setHex(0x4466aa);
        } else if (isTransition) {
            ambientLight.color.setHex(0xffd0a0); // Warm orange
        } else {
            ambientLight.color.setHex(0xfff8dc);
        }
    }

    if (hemiLight) {
        hemiLight.intensity = ambientIntensity + 0.1;
    }

    if (dirLight) {
        dirLight.intensity = lightIntensity;
        // Warmer color at sunrise/sunset
        if (isTransition) {
            dirLight.color.setHex(0xffaa66);
        } else if (isNight) {
            dirLight.color.setHex(0x6688bb); // Moonlight color
        } else {
            dirLight.color.setHex(0xffffff);
        }
    }
}

/**
 * Check if it's currently night time
 * @returns {boolean} True if night time
 */
export function isNightTime() {
    return cycleTime < DAY_NIGHT_CONFIG.sunriseStart || cycleTime > DAY_NIGHT_CONFIG.sunsetEnd;
}

/**
 * Smooth darkness factor for things that want to match the sky without snapping.
 * @returns {number} 0 = full daylight, 1 = full night, ramping through dawn/dusk.
 */
export function getNightFactor() {
    const C = DAY_NIGHT_CONFIG;
    if (cycleTime < C.sunriseStart || cycleTime > C.sunsetEnd) return 1;   // night
    if (cycleTime >= C.sunriseEnd && cycleTime <= C.sunsetStart) return 0; // day
    if (cycleTime < C.sunriseEnd) {                                        // sunrise 1→0
        return 1 - (cycleTime - C.sunriseStart) / (C.sunriseEnd - C.sunriseStart);
    }
    return (cycleTime - C.sunsetStart) / (C.sunsetEnd - C.sunsetStart);    // sunset 0→1
}

/**
 * Get interior light state for store ceiling lights
 * Returns { shouldBeOn: boolean, intensity: number }
 */
export function getInteriorLightState() {
    const isNight = cycleTime < DAY_NIGHT_CONFIG.sunriseStart || cycleTime > DAY_NIGHT_CONFIG.sunsetEnd;
    const isSunset = cycleTime >= DAY_NIGHT_CONFIG.sunsetStart && cycleTime < DAY_NIGHT_CONFIG.sunsetEnd;
    const isSunrise = cycleTime >= DAY_NIGHT_CONFIG.sunriseStart && cycleTime < DAY_NIGHT_CONFIG.sunriseEnd;

    let shouldBeOn = false;
    let intensity = 0;

    if (isNight) {
        shouldBeOn = true;
        intensity = 1;
    } else if (isSunset) {
        // Fade lights on during sunset
        const t = (cycleTime - DAY_NIGHT_CONFIG.sunsetStart) / (DAY_NIGHT_CONFIG.sunsetEnd - DAY_NIGHT_CONFIG.sunsetStart);
        shouldBeOn = true;
        intensity = t;
    } else if (isSunrise) {
        // Fade lights off during sunrise
        const t = (cycleTime - DAY_NIGHT_CONFIG.sunriseStart) / (DAY_NIGHT_CONFIG.sunriseEnd - DAY_NIGHT_CONFIG.sunriseStart);
        shouldBeOn = true;
        intensity = 1 - t;
    }

    return { shouldBeOn, intensity };
}

/**
 * Create 3D cloud meshes in the sky
 */
function createClouds(height) {
    const cloudGroup = new THREE.Group();
    cloudGroup.name = 'clouds';

    // Reduce cloud count on mobile for performance
    const isMobile = isTouchDevice();

    // Cloud material - bright white, visible against sky
    const cloudMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false // so the distant comet is never occluded by clouds
    });

    // Lower height for better visibility (closer to player view)
    const cloudHeight = height * 0.5; // Bring clouds down to ~150m

    // Create clouds spread evenly across the smaller sky dome
    const allCloudConfigs = [
        // North quadrant (negative Z)
        { x: 0, z: -200, y: cloudHeight + 20, scale: 2.2 },
        { x: 60, z: -180, y: cloudHeight + 35, scale: 2.0 },
        { x: -70, z: -190, y: cloudHeight + 15, scale: 2.1 },
        { x: 120, z: -150, y: cloudHeight + 40, scale: 2.3 },
        { x: -120, z: -160, y: cloudHeight + 25, scale: 1.9 },

        // South quadrant (positive Z)
        { x: 0, z: 200, y: cloudHeight + 30, scale: 2.1 },
        { x: 70, z: 180, y: cloudHeight + 20, scale: 2.2 },
        { x: -60, z: 190, y: cloudHeight + 45, scale: 2.0 },
        { x: 120, z: 160, y: cloudHeight + 35, scale: 1.8 },
        { x: -110, z: 150, y: cloudHeight + 15, scale: 2.3 },

        // East quadrant (positive X)
        { x: 200, z: 0, y: cloudHeight + 25, scale: 2.2 },
        { x: 180, z: 60, y: cloudHeight + 40, scale: 2.0 },
        { x: 190, z: -70, y: cloudHeight + 30, scale: 2.1 },
        { x: 160, z: 120, y: cloudHeight + 20, scale: 1.9 },

        // West quadrant (negative X)
        { x: -200, z: 0, y: cloudHeight + 35, scale: 2.1 },
        { x: -180, z: -60, y: cloudHeight + 20, scale: 2.2 },
        { x: -190, z: 70, y: cloudHeight + 45, scale: 2.0 },
        { x: -160, z: -120, y: cloudHeight + 30, scale: 1.8 },

        // Corners
        { x: 150, z: -150, y: cloudHeight + 35, scale: 2.2 },
        { x: -150, z: -150, y: cloudHeight + 40, scale: 2.1 },
        { x: 150, z: 150, y: cloudHeight + 30, scale: 2.0 },
        { x: -150, z: 150, y: cloudHeight + 25, scale: 2.2 },

        // A few closer clouds for foreground interest
        { x: 50, z: -70, y: cloudHeight + 10, scale: 1.6 },
        { x: -60, z: 50, y: cloudHeight + 20, scale: 1.7 },
        { x: 70, z: 40, y: cloudHeight + 5, scale: 1.5 },
        { x: -50, z: -50, y: cloudHeight + 15, scale: 1.8 },
    ];

    // Use half the clouds on mobile for better performance
    const cloudConfigs = isMobile
        ? allCloudConfigs.filter((_, i) => i % 2 === 0)
        : allCloudConfigs;

    cloudConfigs.forEach((config, index) => {
        const cloud = createSingleCloud(cloudMaterial, config.scale);
        cloud.position.set(config.x, config.y, config.z);
        cloud.name = `cloud_${index}`;
        cloudGroup.add(cloud);
    });

    scene.add(cloudGroup);
}

// Shared cloud puff geometries — one per unique base radius (7 total instead of 240)
const CLOUD_PUFFS = [
    { x: 0, y: 0, z: 0, r: 15 },
    { x: 12, y: 3, z: 2, r: 12 },
    { x: -10, y: 2, z: -3, r: 13 },
    { x: 8, y: -2, z: -5, r: 10 },
    { x: -8, y: -1, z: 4, r: 11 },
    { x: 18, y: 1, z: -2, r: 9 },
    { x: -16, y: 0, z: 0, r: 10 },
    { x: 5, y: 4, z: 6, r: 8 },
    { x: -5, y: 3, z: -6, r: 9 },
    { x: 0, y: 5, z: 0, r: 10 },
];
const cloudPuffGeometries = {};
for (const puff of CLOUD_PUFFS) {
    if (!cloudPuffGeometries[puff.r]) {
        cloudPuffGeometries[puff.r] = new THREE.SphereGeometry(puff.r, 8, 6);
    }
}

/**
 * Create a single fluffy cloud from multiple spheres
 */
function createSingleCloud(material, cloudScale) {
    const cloud = new THREE.Group();

    CLOUD_PUFFS.forEach(puff => {
        const sphere = new THREE.Mesh(cloudPuffGeometries[puff.r], material);
        sphere.position.set(puff.x * cloudScale, puff.y * cloudScale, puff.z * cloudScale);
        sphere.scale.setScalar(cloudScale);
        cloud.add(sphere);
    });

    return cloud;
}

/**
 * Add a test cube to verify rendering
 */
function addTestCube() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
        color: 0x2da6ed,
        roughness: 0.7,
        metalness: 0.2
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 0.5, -5);
    cube.castShadow = true;
    cube.receiveShadow = true;
    cube.name = 'testCube';
    scene.add(cube);

    // Add a ground plane for reference
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x333344,
        roughness: 0.9
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    ground.name = 'tempGround';
    scene.add(ground);
}

/**
 * Remove test objects from scene
 */
export function removeTestObjects() {
    const testCube = scene.getObjectByName('testCube');
    const tempGround = scene.getObjectByName('tempGround');

    if (testCube) {
        testCube.geometry.dispose();
        testCube.material.dispose();
        scene.remove(testCube);
    }

    if (tempGround) {
        tempGround.geometry.dispose();
        tempGround.material.dispose();
        scene.remove(tempGround);
    }
}

/**
 * Handle window resize
 */
export function handleResize() {
    if (!camera || !renderer) return;
    if (renderer.xr && renderer.xr.isPresenting) return; // XR manages viewport

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Keep the 1.5 pixel-ratio cap on resize (matches initScene)
    const maxPixelRatio = 1.5;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
}

/**
 * Render a single frame
 */
export function render() {
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
}

/**
 * Get scene components
 */
export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
export function getCameraRig() { return cameraRig; }

export { SCENE_CONFIG };

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = { hexToRgb, lerpColorRgb, DAY_NIGHT_CONFIG };

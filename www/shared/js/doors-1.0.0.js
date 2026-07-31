// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * doors.js - Automatic sliding doors (shared engine part)
 *
 * The experience builds its two glass door panes (with userData.closedX set)
 * and hands them to registerDoors(); updateDoors() slides them open near the
 * player with a synthesized whoosh. The door's world position derives from
 * the building config (positionX + doorOffsetX at the front wall).
 */
import { getWorldConfig } from './world-1.0.0.min.js';

// Automatic doors
const doors = {
    left: null,
    right: null,
    isOpen: false,
    openAmount: 0,        // 0 = closed, 1 = fully open
    openSpeed: 3,         // Speed of door animation
    triggerDistance: 5,   // Distance to trigger door opening
    maxSlide: 2.0,        // How far doors slide open (meters)
    // Audio
    audioContext: null,
    wasOpening: false,    // Track previous state for sound triggers
    wasClosing: false
};

/**
 * Register the two sliding door panes built by the experience. Each mesh must
 * carry userData.closedX (its resting x). Optional opts override trigger
 * distance, slide distance, and animation speed.
 */
export function registerDoors(left, right, opts = {}) {
    doors.left = left;
    doors.right = right;
    doors.isOpen = false;
    doors.openAmount = 0;
    doors.wasOpening = false;
    doors.wasClosing = false;
    if (typeof opts.triggerDistance === 'number') doors.triggerDistance = opts.triggerDistance;
    if (typeof opts.maxSlide === 'number') doors.maxSlide = opts.maxSlide;
    if (typeof opts.openSpeed === 'number') doors.openSpeed = opts.openSpeed;
}

/**
 * Initialize door sound system
 */
export function initDoorAudio() {
    // Create audio context on first user interaction
    const initAudio = () => {
        // Some environments expose neither constructor; the doors then simply
        // stay silent instead of this one-time listener throwing.
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!doors.audioContext && Ctx) {
            doors.audioContext = new Ctx();
        }
        document.removeEventListener('click', initAudio);
        document.removeEventListener('keydown', initAudio);
    };
    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);
}

/**
 * Play door sound effect (synthesized whoosh)
 * @param {boolean} isOpening - true for opening sound, false for closing
 */
export function playDoorSound(isOpening) {
    if (!doors.audioContext) return;

    try {
        const ctx = doors.audioContext;
        const now = ctx.currentTime;

        // Create noise for whoosh effect
        const bufferSize = ctx.sampleRate * 0.3; // 0.3 second sound
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // Generate filtered noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
        }

        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = buffer;

        // Bandpass filter for whoosh character
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(isOpening ? 800 : 600, now);
        filter.frequency.exponentialRampToValueAtTime(isOpening ? 400 : 300, now + 0.3);
        filter.Q.value = 1.5;

        // Volume envelope
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.4, now + 0.05); // Louder volume
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        // Connect nodes
        noiseSource.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);

        noiseSource.start(now);
        noiseSource.stop(now + 0.3);
    } catch (e) {
        // Silently fail if audio doesn't work
    }
}

/**
 * Update automatic doors based on player position
 * @param {THREE.Vector3} playerPosition - Current player position
 * @param {number} deltaTime - Time since last frame
 */
export function updateDoors(playerPosition, deltaTime) {
    if (!doors.left || !doors.right) return;

    const { positionX, positionZ, depth, doorOffsetX } = getWorldConfig().building;

    // Door position (center of door opening)
    const doorX = positionX + doorOffsetX;
    const doorZ = positionZ + depth / 2;

    // Calculate distance to door
    const dx = playerPosition.x - doorX;
    const dz = playerPosition.z - doorZ;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // Determine if doors should be open
    const shouldOpen = distance < doors.triggerDistance;

    // Track state changes for sound effects
    const wasFullyClosed = doors.openAmount === 0;
    const wasFullyOpen = doors.openAmount === 1;

    // Animate door opening/closing
    if (shouldOpen && doors.openAmount < 1) {
        // Play opening sound when doors start to open
        if (wasFullyClosed && !doors.wasOpening) {
            playDoorSound(true);
            doors.wasOpening = true;
            doors.wasClosing = false;
        }
        doors.openAmount = Math.min(1, doors.openAmount + deltaTime * doors.openSpeed);
    } else if (!shouldOpen && doors.openAmount > 0) {
        // Play closing sound when doors start to close
        if (wasFullyOpen && !doors.wasClosing) {
            playDoorSound(false);
            doors.wasClosing = true;
            doors.wasOpening = false;
        }
        doors.openAmount = Math.max(0, doors.openAmount - deltaTime * doors.openSpeed);
    }

    // Reset state trackers when fully open/closed
    if (doors.openAmount === 0) {
        doors.wasOpening = false;
    }
    if (doors.openAmount === 1) {
        doors.wasClosing = false;
    }

    // Apply easing for smooth animation
    const eased = easeInOutQuad(doors.openAmount);
    const slideDistance = eased * doors.maxSlide;

    // Move doors (left slides left, right slides right)
    doors.left.position.x = doors.left.userData.closedX - slideDistance;
    doors.right.position.x = doors.right.userData.closedX + slideDistance;
}

/**
 * Easing function for smooth door animation
 */
export function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Get door state
 */
export function getDoorsOpen() {
    return doors.openAmount > 0.5;
}

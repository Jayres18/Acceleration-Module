/**
 * trialMode — the rules of the limited trial build, in one place.
 *
 * Kept dependency-free with storage injected, exactly as examLink.js is, so the
 * quota can be driven from Node. It knows nothing about the DOM, three.js or
 * the app: `main.js` reads the compile-time flag and applies these rules.
 *
 * The quota is a speed bump, not DRM. It lives in localStorage, and anyone who
 * opens devtools can clear it. Enforcing it properly would need a server, which
 * is the one thing a trial build does not have — so nothing here is obfuscated,
 * and nothing should be.
 */

const KEY = 'acceleration:trial-launches';

/** Flights allowed before the trial locks the LAUNCH button. */
export const LAUNCH_QUOTA = 5;

/**
 * Slider bounds for the trial, narrower than the full module's 0-200 N and
 * 1-50 kg. One definition, applied to both the DOM sliders and the VR control
 * panel — written out twice, the two surfaces disagree about what is legal.
 *
 * The range still teaches F = ma: acceleration runs from 0.19 m/s² (200 N on
 * 20 kg) to 30.2 m/s² (200 N on 5 kg), and an under-powered launch is still
 * reachable, so the "not enough thrust" lesson survives.
 */
export const TRIAL_RANGES = {
    thrust: { min: 100, max: 200 },
    mass:   { min: 5,   max: 20 },
};

/**
 * Shown when the quota runs out.
 *
 * PLACEHOLDER — replace with the real wording and address before this build is
 * handed to anyone.
 */
export const TRIAL_CTA = {
    title: 'TRIAL COMPLETE',
    body: `You have used all ${LAUNCH_QUOTA} trial flights. The full module has `
        + 'unlimited launches, the complete thrust and mass range, and '
        + 'exam-backed challenges scored through the portal.',
    action: 'Contact us for the full version',   // PLACEHOLDER
    href: '',                                    // PLACEHOLDER — leave empty to render as plain text
};

/**
 * Storage can throw outright when it is disabled, not merely return null, so
 * both directions are guarded. A trial that crashes in a locked-down browser is
 * worse than one whose counter does not persist.
 */
function read(store) {
    try {
        return store?.getItem(KEY) ?? '';
    } catch {
        return '';
    }
}

function write(store, value) {
    try {
        store?.setItem(KEY, String(value));
    } catch {
        // Not persisting is survivable; failing to launch is not.
    }
}

/**
 * Flights used so far.
 *
 * Anything that is not a non-negative whole number reads as zero. The value is
 * a string in a store any page script can write to, so '', 'abc' and '-3' all
 * have to mean "start again" rather than NaN spreading through the arithmetic.
 */
export function launchesUsed(store = globalThis.localStorage) {
    const raw = read(store);
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Spend one flight. Returns the new total. */
export function recordLaunch(store = globalThis.localStorage) {
    const used = launchesUsed(store) + 1;
    write(store, used);
    return used;
}

/** Flights remaining, never below zero. */
export function launchesLeft(store = globalThis.localStorage) {
    return Math.max(0, LAUNCH_QUOTA - launchesUsed(store));
}

/** True once the quota is gone and LAUNCH should be locked. */
export function isExhausted(store = globalThis.localStorage) {
    return launchesLeft(store) === 0;
}

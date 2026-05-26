// audio/AudioManager.js
// Manages all narration and sound-effect playback for the Acceleration Module.

export class AudioManager {
    constructor() {
        const BASE = import.meta.env.BASE_URL; // '/acceleration/' in dev & preview

        // ── Narration elements ──────────────────────────────────────────────
        this._narration = {};
        const narrationKeys = [
            'intro', 'pre-launch', 'countdown', 'liftoff',
            'milestone-100m', 'milestone-500m', 'milestone-1000m',
            'fuel-warning-50', 'fuel-warning-25', 'fuel-empty'
        ];
        for (const key of narrationKeys) {
            const el = new Audio(`${BASE}audio/narration/${key}.mp3`);
            el.preload = 'auto';
            this._narration[key] = el;
        }

        // ── SFX elements ────────────────────────────────────────────────────
        this._sfx = {};
        const sfxKeys = [
            'sfx-engine-loop', 'sfx-engine-cutoff', 'sfx-countdown-beep',
            'sfx-liftoff-rumble', 'sfx-altitude-chime', 'sfx-fuel-alarm',
            'sfx-launch-click', 'sfx-reset-click'
        ];
        for (const key of sfxKeys) {
            const el = new Audio(`${BASE}audio/sfx/${key}.mp3`);
            el.preload = 'auto';
            this._sfx[key] = el;
        }
        this._sfx['sfx-engine-loop'].loop = true;

        // ── State ───────────────────────────────────────────────────────────
        this._currentNarration = null; // currently-playing narration element
        this._loopSfx          = null; // currently-looping SFX element
        this._played           = new Set(); // fired event keys this flight
    }

    // ── Narration ──────────────────────────────────────────────────────────

    /**
     * Stop any current narration and play a new clip.
     * Marks the key as played so hasPlayed() returns true.
     * Returns the HTMLAudioElement so callers can chain `.onended`.
     */
    play(eventKey) {
        // Stop and rewind whatever was playing
        if (this._currentNarration) {
            this._currentNarration.pause();
            this._currentNarration.currentTime = 0;
            this._currentNarration.onended = null;
        }

        const audio = this._narration[eventKey];
        if (!audio) {
            console.warn(`[AudioManager] Unknown narration key: "${eventKey}"`);
            return null;
        }

        this._played.add(eventKey);
        audio.currentTime = 0;
        audio.onended = null;
        this._currentNarration = audio;
        audio.play().catch(() => {
            // Browser blocked autoplay — fail silently, student sees the sim
        });
        return audio;
    }

    // ── SFX ────────────────────────────────────────────────────────────────

    /**
     * Play a one-shot SFX clip (does NOT interrupt narration).
     * Clones the element so rapid repeat calls don't cut each other off.
     */
    playSfx(eventKey) {
        const audio = this._sfx[eventKey];
        if (!audio) {
            console.warn(`[AudioManager] Unknown SFX key: "${eventKey}"`);
            return;
        }
        const clone = audio.cloneNode();
        clone.play().catch(() => {});
    }

    /**
     * Start a looping SFX clip (engine rumble).
     * Stops any previously looping clip first.
     */
    playLoop(eventKey) {
        this.stopLoop();
        const audio = this._sfx[eventKey];
        if (!audio) return;
        this._loopSfx = audio;
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }

    /** Stop the looping SFX clip. */
    stopLoop() {
        if (this._loopSfx) {
            this._loopSfx.pause();
            this._loopSfx.currentTime = 0;
            this._loopSfx = null;
        }
    }

    /** Silence all audio immediately (narration + loop). */
    stopAll() {
        if (this._currentNarration) {
            this._currentNarration.pause();
            this._currentNarration.currentTime = 0;
            this._currentNarration.onended = null;
            this._currentNarration = null;
        }
        this.stopLoop();
    }

    // ── State helpers ──────────────────────────────────────────────────────

    /** Returns true if this narration key has already fired this flight. */
    hasPlayed(eventKey) {
        return this._played.has(eventKey);
    }

    /**
     * Clear per-flight state and stop all audio.
     * Call this on RESET or NEXT QUESTION.
     */
    reset() {
        this.stopAll();
        this._played.clear();
    }
}

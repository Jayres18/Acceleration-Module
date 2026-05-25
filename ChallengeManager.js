// ChallengeManager.js
const TARGETS_MAP = [
    { param: 'target_max_velocity',  key: 'maxVelocity',     label: 'Max Velocity',     unit: 'm/s',  decimals: 2 },
    { param: 'target_peak_altitude', key: 'peakAltitude',    label: 'Peak Altitude',    unit: 'm',    decimals: 2 },
    { param: 'target_avg_accel',     key: 'avgAcceleration', label: 'Avg Acceleration', unit: 'm/s²', decimals: 2 },
    { param: 'target_flight_time',   key: 'flightTime',      label: 'Flight Time',      unit: 's',    decimals: 2 },
];

export class ChallengeManager {
    constructor() {
        // ── URL-param mode (single challenge, backward-compatible) ──────
        const params = new URLSearchParams(window.location.search);
        this.targets = [];

        for (const def of TARGETS_MAP) {
            const raw = params.get(def.param);
            if (raw !== null) {
                const value = parseFloat(raw);
                if (!isNaN(value)) this.targets.push({ ...def, value });
            }
        }

        this.isActive     = this.targets.length > 0;
        this.attemptCount = 0;

        // ── Exam-mode state (populated by loadFromExam) ─────────────────
        this._examMode          = false;
        this._questions         = [];
        this._currentIndex      = 0;
        this._currentQuestionId = null;
        this._scores            = [];
    }

    // ── Exam-mode API ────────────────────────────────────────────────────

    /**
     * Load an ordered array of API questions. Overwrites any URL-param targets.
     * No-op if questions is empty — app stays in free-play mode.
     * @param {Array<{question_id: number, question_properties_values: object}>} questions
     */
    loadFromExam(questions) {
        if (!questions || questions.length === 0) return;
        this._questions    = questions;
        this._currentIndex = 0;
        this._scores       = [];
        this._examMode     = true;
        this.isActive      = true;
        this._loadCurrentQuestion();
    }

    /**
     * Advance to the next question. Guards against out-of-bounds and non-exam mode.
     */
    nextQuestion() {
        if (!this._examMode || this._currentIndex >= this._questions.length - 1) return;
        this._currentIndex++;
        this._loadCurrentQuestion();
    }

    /**
     * Record whether the current question was passed.
     * Called automatically by evaluate() in exam mode; idempotent per question_id.
     * @param {boolean} isCorrect
     */
    recordResult(isCorrect) {
        // Idempotent: only record once per question to prevent double-evaluation
        const alreadyRecorded = this._scores.some(s => s.question_id === this._currentQuestionId);
        if (!alreadyRecorded) {
            this._scores.push({ question_id: this._currentQuestionId, is_correct: isCorrect });
        }
    }

    /** @returns {Array<{question_id: number, is_correct: boolean}>} snapshot copy */
    getScores() {
        return [...this._scores];
    }

    /**
     * True when the current question is the last one in the exam.
     * Returns null when not in exam mode.
     */
    get isLastQuestion() {
        if (!this._examMode) return null;
        return this._currentIndex >= this._questions.length - 1;
    }

    /**
     * { current: 1-based index, total: question count }
     * Returns null when not in exam mode.
     */
    get questionProgress() {
        if (!this._examMode) return null;
        return { current: this._currentIndex + 1, total: this._questions.length };
    }

    /** True when loaded from API (exam mode), false for URL-param mode. */
    get isExamMode() {
        return this._examMode;
    }

    // ── Shared API ───────────────────────────────────────────────────────

    /** Returns array of { label, unit, decimals, target, actual, passed, delta }. */
    evaluate(results) {
        this.attemptCount++;
        const score = this.targets.map(t => {
            const actual = results[t.key] ?? 0;
            const passed = actual >= t.value;
            const delta  = actual - t.value;
            return { label: t.label, unit: t.unit, decimals: t.decimals, target: t.value, actual, passed, delta };
        });

        // In exam mode, record pass/fail automatically (recordResult is idempotent)
        if (this._examMode) {
            this.recordResult(score.every(r => r.passed));
        }

        return score;
    }

    /** Called on every reset — intentionally preserves attemptCount. */
    reset() {}

    // ── Private ──────────────────────────────────────────────────────────

    _loadCurrentQuestion() {
        const q = this._questions[this._currentIndex];
        this._currentQuestionId = q.question_id;
        this.targets = [];
        for (const def of TARGETS_MAP) {
            const raw = q.question_properties_values[def.param];
            if (raw !== undefined && raw !== null) {
                const value = parseFloat(raw);
                if (!isNaN(value)) this.targets.push({ ...def, value });
            }
        }
    }
}

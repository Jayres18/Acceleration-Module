// ChallengeManager.js
const TARGETS_MAP = [
    { param: 'target_max_velocity',  key: 'maxVelocity',     label: 'Max Velocity',     unit: 'm/s',  decimals: 2 },
    { param: 'target_peak_altitude', key: 'peakAltitude',    label: 'Peak Altitude',    unit: 'm',    decimals: 2 },
    { param: 'target_avg_accel',     key: 'avgAcceleration', label: 'Avg Acceleration', unit: 'm/s²', decimals: 2 },
];

// `target_flight_time` is deliberately absent, though the results panel still
// reports the figure. Fuel burns half a percent per frame and the flight's
// numbers are captured at burnout, so every flight lasts exactly 200 frames —
// 3.33 s at 60 Hz — whatever the student does with the sliders. As a target it
// grades the refresh rate rather than the physics, and it would do so silently.
// Left out, a question carrying nothing else reports "no usable targets" and
// says which question it was.

/**
 * Read a question's `question_properties_values` into a plain object.
 *
 * The column is free-form JSON on the exam row and nothing validates it on the
 * way in, so it may arrive as an object, as a JSON *string* of that object, or
 * as null. A string indexes to `undefined` for every key rather than throwing,
 * which is the bad case: the question loads with no targets and looks fine.
 *
 * @returns {object} always an object — `{}` when there was nothing usable.
 */
function parseQuestionProps(question) {
    let props = question?.question_properties_values;

    if (typeof props === 'string') {
        try {
            props = JSON.parse(props);
        } catch {
            console.error(
                '[ExamMode] Unparseable question_properties_values on question',
                question?.question_id, props,
            );
            props = null;
        }
    }

    return props && typeof props === 'object' ? props : {};
}

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
        if (!Array.isArray(questions) || questions.length === 0) return;

        // Items carry `question_id`; some carry `id` instead. Settle on one up
        // front — this value is what goes back in the score payload, and the
        // endpoint rejects the whole submission if it does not match a question
        // the exam actually contains.
        this._questions = questions.map(q => ({
            ...q,
            question_id: q?.question_id ?? q?.id,
        }));

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

    /**
     * Every question in the exam, in order, with the ones the student never
     * reached marked incorrect.
     *
     * The sitting is recorded by a single POST, so this array is the only
     * record that will ever exist — a question omitted here is not "unanswered"
     * in the database, it is absent. Unreached questions are therefore included
     * explicitly rather than left to be inferred.
     *
     * @returns {Array<{question_id: number, is_correct: boolean}>}
     */
    getScores() {
        if (!this._examMode) return [...this._scores];

        return this._questions.map(q => {
            const recorded = this._scores.find(s => s.question_id === q.question_id);
            return {
                question_id: q.question_id,
                is_correct: recorded ? recorded.is_correct : false,
            };
        });
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

        // In exam mode, record pass/fail automatically (recordResult is idempotent).
        //
        // `[].every()` is true, so a question whose targets failed to parse would
        // otherwise award a mark to everyone who launched at all. Requiring at
        // least one target makes broken exam data cost a mark rather than hand
        // out a meaningless perfect score — and _loadCurrentQuestion has already
        // logged which question it was.
        if (this._examMode) {
            this.recordResult(score.length > 0 && score.every(r => r.passed));
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

        const props = parseQuestionProps(q);

        for (const def of TARGETS_MAP) {
            const raw = props[def.param];
            if (raw === undefined || raw === null || raw === '') continue;

            // Number, not parseFloat: the values arrive as strings and
            // parseFloat happily reads "12abc" as 12, which would silently
            // grade against a target nobody set.
            const value = Number(raw);
            if (Number.isFinite(value)) {
                this.targets.push({ ...def, value });
            } else {
                console.error(
                    '[ExamMode] Non-numeric target on question', q.question_id,
                    `${def.param}=`, raw,
                );
            }
        }

        // No usable target means nothing to grade against. That must not read as
        // "all targets met" — see the guard in evaluate().
        if (this.targets.length === 0) {
            console.error(
                '[ExamMode] Question', q.question_id,
                'has no usable targets; it cannot be passed.',
                'Raw question_properties_values:', q.question_properties_values,
            );
        }
    }
}

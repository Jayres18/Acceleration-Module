// xr/VRResultPanel.js
import { VRPanel, m } from './VRPanel.js';
import { COLOR, SIZE, LAYOUT } from '../ui/tokens.js';

const ROWS = [
    { key: 'launchForce',      label: 'Launch Force',      unit: 'N',    decimals: 1 },
    { key: 'rocketMass',       label: 'Rocket Mass',       unit: 'kg',   decimals: 1 },
    { key: 'maxVelocity',      label: 'Max Velocity',      unit: 'm/s',  decimals: 2 },
    { key: 'avgAcceleration',  label: 'Avg Acceleration',  unit: 'm/s²', decimals: 2 },
    { key: 'peakAltitude',     label: 'Peak Altitude',     unit: 'm',    decimals: 2 },
    { key: 'flightTime',       label: 'Flight Time',       unit: 's',    decimals: 2 },
    { key: 'distanceTraveled', label: 'Distance Traveled', unit: 'm',    decimals: 2 },
];

const W = LAYOUT.main.w;
const PAD = SIZE.pad;
const ROW_H = 0.042;
const TOP = 0.09;                 // below the title
const SAVE_LINES = 0.1;           // reserved for the three-line failure case

/**
 * Flight results, in the main panel's spot (it takes the spot over while open —
 * never stacked on top of another panel).
 *
 * Two shapes. A graded exam flight carries the exam's Next / Submit button and
 * the save-status strip; anything else — free play, Learn, a practice flight
 * during a sitting — gets a Fly Again button. The panel is rebuilt to fit on
 * every setResults, because the same sitting can produce both.
 */
export class VRResultPanel extends VRPanel {
    /**
     * @param {object} o
     * @param {object} o.nav        { back, menu, reset, exit }
     * @param {object} o.challenge  ChallengeManager
     * @param {Function} o.onNext
     * @param {Function} o.onSubmit
     * @param {Function} o.onReset
     */
    constructor({ nav, challenge = null, onNext = null, onSubmit = null, onReset = null }) {
        super(W, 0.6);
        this._nav              = nav;
        this._challengeManager = challenge;
        this._onNext           = onNext;
        this._onSubmit         = onSubmit;
        this._onReset          = onReset;

        this._results          = null;
        this._challengeScore   = null;
        this._attemptCount     = 0;
        this._examFlight       = false;
        this._examSubmitted    = false;
        this._saveStatus       = null;
        this._saveError        = '';
        this._examLabel        = '';
    }

    setResults(results, challengeScore = null, attemptCount = 0) {
        this._results        = results;
        this._challengeScore = challengeScore;
        this._attemptCount   = attemptCount;
        // An exam flight is a graded one in an exam sitting. A practice flight
        // in the same sitting gets the free-play shape.
        this._examFlight = !!(challengeScore && this._challengeManager?.isExamMode);

        // An unsaved sitting keeps its RETRY SAVE label — a further flight does
        // not change the fact that scores are still sitting on this headset.
        if (this._examFlight && !this._examSubmitted && this._saveStatus !== 'unsaved') {
            this._examLabel = this._challengeManager.isLastQuestion ? 'Submit Exam' : 'Next Question';
        }
        this._build();
    }

    /**
     * Show where the sitting stands with the server.
     *
     * A failed save has to reopen the button, not just relabel it: the student
     * is in a headset with no console, and the panel is the only place the
     * failure can be seen or acted on. The retry reuses the exam-action button,
     * so it is reachable by controller ray and by hand pinch — both arrive as
     * the same select event — without a second input path to maintain.
     *
     * @param {'submitting'|'saved'|'unsaved'} status
     * @param {string} message  server's reason, shown only when unsaved
     */
    showSaveStatus(status, message = '') {
        this._saveStatus = status;
        this._saveError  = message;
        this._examSubmitted = status === 'saved';
        this._examLabel = status === 'submitting' ? 'Saving…'
            : status === 'saved' ? 'Exam Submitted'
            : 'Retry Save';
        if (this._results) this._build();
    }

    get _height() {
        let h = TOP + ROWS.length * ROW_H;
        if (this._challengeScore) {
            h += 0.015 + 0.045 + this._challengeScore.length * ROW_H;
            if (!this._challengeManager?.isExamMode) h += 0.04;
        }
        h += 0.02 + SIZE.buttonH;                      // action button
        if (this._examFlight) h += SAVE_LINES;
        return h + 0.02 + VRPanel.NAV_H;
    }

    _build() {
        this.resize(W, this._height);
        this.clearElements();

        // The action button sits just above the nav bar (and above the save
        // strip, on an exam flight).
        const actionY = this.canvasH - m(VRPanel.NAV_H + 0.02 + SIZE.buttonH + (this._examFlight ? SAVE_LINES : 0));
        if (this._examFlight) {
            const busy = this._saveStatus === 'submitting' || this._saveStatus === 'saved';
            this.addButton('exam-action', this._examLabel, m(PAD), actionY, m(0.36), m(SIZE.buttonH),
                () => this._handleExamAction(), { variant: 'primary' });
            this.setDisabled('exam-action', busy);
        } else {
            this.addButton('again', 'Fly Again', m(PAD), actionY, m(0.3), m(SIZE.buttonH),
                () => this._onReset?.(), { variant: 'primary' });
        }

        // During an exam flight, leaving the scorecard is done with Next / Submit
        // only, as before — so Back and Reset are shown but off.
        this._addNavBar(this._nav, { back: !this._examFlight, reset: !this._examFlight });
        this.render();
    }

    render() {
        this._drawBackground();
        this._drawTitle('Flight Results');
        if (this._results) {
            this._renderRows();
            if (this._challengeScore) this._renderScore();
            if (this._examFlight) this._drawSaveLine();
        }
        this.elements.forEach(el => this._drawButton(el));
        super.render();
    }

    _renderRows() {
        const { ctx } = this;
        ROWS.forEach((row, i) => {
            const y = TOP + i * ROW_H;
            if (i % 2 === 0) {
                ctx.fillStyle = COLOR.surface;
                ctx.fillRect(m(PAD), m(y), m(W - PAD * 2), m(ROW_H));
            }
            const val = this._results[row.key];
            this._drawText(row.label, m(PAD + 0.012), m(y + 0.007), { maxLines: 1 });
            this._drawText(`${val.toFixed(row.decimals)} ${row.unit}`, m(W - PAD - 0.012), m(y + 0.007),
                { weight: 700, color: COLOR.textPrimary, align: 'right', maxLines: 1, maxW: m(0.4) });
        });
    }

    _renderScore() {
        const { ctx } = this;
        const top = TOP + ROWS.length * ROW_H + 0.015;
        this._drawText('Challenge Score', m(PAD), m(top + 0.005), {
            size: SIZE.heading, weight: 700, color: COLOR.accent, maxLines: 1,
        });

        this._challengeScore.forEach((r, i) => {
            const y = top + 0.045 + i * ROW_H;
            if (i % 2 === 0) {
                ctx.fillStyle = COLOR.surface;
                ctx.fillRect(m(PAD), m(y), m(W - PAD * 2), m(ROW_H));
            }
            const color = r.passed ? COLOR.success : COLOR.error;
            this._drawText(`${r.passed ? '✓' : '✗'}  ${r.label}`, m(PAD + 0.012), m(y + 0.007),
                { weight: 700, color, maxLines: 1, maxW: m(0.38) });
            const sign = r.delta >= 0 ? '+' : '';
            const valStr = `${r.actual.toFixed(r.decimals)} / ${r.target.toFixed(r.decimals)} ${r.unit} (${sign}${r.delta.toFixed(r.decimals)})`;
            this._drawText(valStr, m(W - PAD - 0.012), m(y + 0.007),
                { color: COLOR.textPrimary, align: 'right', maxLines: 1, maxW: m(0.44) });
        });

        // Attempt count (URL-param mode only; exam mode shows question progress instead)
        if (!this._challengeManager?.isExamMode) {
            const y = top + 0.045 + this._challengeScore.length * ROW_H + 0.008;
            this._drawText(`Attempt ${this._attemptCount}`, m(PAD), m(y), { color: COLOR.textMuted, maxLines: 1 });
        }
    }

    /**
     * The save-status strip, between the exam button and the nav bar.
     *
     * Nothing is drawn before a submission is attempted — until then there is
     * genuinely nothing to report.
     */
    _drawSaveLine() {
        if (!this._saveStatus) return;
        const y = this.canvasH - m(VRPanel.NAV_H + 0.01 + SAVE_LINES);

        if (this._saveStatus === 'submitting') {
            this._drawText('Saving scores…', m(PAD), y, { maxLines: 1 });
        } else if (this._saveStatus === 'saved') {
            this._drawText('Scores saved.', m(PAD), y, { weight: 700, color: COLOR.success, maxLines: 1 });
        } else {
            this._drawText('Scores not saved', m(PAD), y, { weight: 700, color: COLOR.error, maxLines: 1 });
            this._drawText(this._saveError, m(PAD), y + m(0.032), { size: SIZE.bodyMin, color: COLOR.error, maxLines: 1 });
            this._drawText('Select Retry Save, or tell your teacher.', m(PAD), y + m(0.062),
                { size: SIZE.bodyMin, color: COLOR.textMuted, maxLines: 1 });
        }
    }

    _handleExamAction() {
        // A sitting the server has accepted is finished — but a failed one is
        // not, so this only latches on success. `main.js` guards the submit
        // itself, which is what makes a double-tap during the request safe.
        if (this._saveStatus === 'saved' || this._saveStatus === 'submitting') return;

        if (this._challengeManager.isLastQuestion) {
            // Disable immediately to swallow a double-tap; showSaveStatus takes
            // over the label from here, including reopening it for a retry.
            this.setDisabled('exam-action', true);
            this.render();
            this._onSubmit && this._onSubmit();
        } else {
            this._onNext && this._onNext();
        }
    }
}

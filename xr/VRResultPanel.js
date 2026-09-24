// xr/VRResultPanel.js
import { VRPanel } from './VRPanel.js';

const ROWS = [
    { key: 'launchForce',      label: 'Launch Force',      unit: 'N',    decimals: 1 },
    { key: 'rocketMass',       label: 'Rocket Mass',       unit: 'kg',   decimals: 1 },
    { key: 'maxVelocity',      label: 'Max Velocity',      unit: 'm/s',  decimals: 2 },
    { key: 'avgAcceleration',  label: 'Avg Acceleration',  unit: 'm/s²', decimals: 2 },
    { key: 'peakAltitude',     label: 'Peak Altitude',     unit: 'm',    decimals: 2 },
    { key: 'flightTime',       label: 'Flight Time',       unit: 's',    decimals: 2 },
    { key: 'distanceTraveled', label: 'Distance Traveled', unit: 'm',    decimals: 2 },
];

function challengeExtraH(challengeManager) {
    if (!challengeManager?.isActive) return 0;
    const base   = 12 + 40 + challengeManager.targets.length * 38 + 40;
    // Panel dimensions are fixed at construction, so the room for the exam
    // button and the save-status line has to be reserved now — the line is
    // three lines tall in the failure case, which is the one that must be
    // readable rather than clipped.
    const examBtn   = challengeManager.isExamMode ? 60 : 0;
    const saveLine  = challengeManager.isExamMode ? 64 : 0;
    return base + examBtn + saveLine;
}

export class VRResultPanel extends VRPanel {
    constructor(onClose, challengeManager = null, onNext = null, onSubmit = null, onReset = null) {
        const extraH  = challengeExtraH(challengeManager);
        const canvasH = 428 + extraH;
        const worldH  = canvasH * (0.75 / 428);
        super(0.90, worldH, 512, canvasH);

        this._results          = null;
        this._challengeScore   = null;
        this._attemptCount     = 0;
        this._challengeManager = challengeManager;
        this._onNext           = onNext;
        this._onSubmit         = onSubmit;
        this._examSubmitted    = false;
        this._saveStatus       = null;
        this._saveError        = '';

        const isExam = challengeManager?.isExamMode;

        if (isExam) {
            // Exam mode: action button (Next / Submit), no close button. Sits
            // above the reserved save-status strip at the foot of the panel.
            const label = challengeManager.isLastQuestion ? 'Submit Exam ✓' : 'Next Question →';
            this.addButton('exam-action', label, 106, canvasH - 118, 300, 40,
                () => this._handleExamAction(), {});
        } else {
            // Free-play / URL-param mode: CLOSE dismisses the panel and leaves
            // the rocket coasting; RESET puts it back on the pad. Two 190 px
            // buttons with a 20 px gap, centred in the 512 px canvas.
            this.addButton('close', 'CLOSE', 56,  canvasH - 54, 190, 40, onClose, {});
            this.addButton('reset', 'RESET', 266, canvasH - 54, 190, 40, onReset, {});
        }

        this.render();
    }

    setResults(results, challengeScore = null, attemptCount = 0) {
        this._results        = results;
        this._challengeScore = challengeScore;
        this._attemptCount   = attemptCount;

        // Update exam action button label to reflect current question position.
        // An unsaved sitting keeps its RETRY SAVE label — a further flight does
        // not change the fact that scores are still sitting on this headset.
        if (this._challengeManager?.isExamMode
            && !this._examSubmitted
            && this._saveStatus !== 'unsaved') {
            const el = this.elements.find(e => e.id === 'exam-action');
            if (el) {
                el.label    = this._challengeManager.isLastQuestion ? 'Submit Exam ✓' : 'Next Question →';
                el.disabled = false;
            }
        }

        this.render();
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

        const el = this.elements.find(e => e.id === 'exam-action');
        if (el) {
            if (status === 'submitting') {
                el.label = 'Saving…';
                el.disabled = true;
            } else if (status === 'saved') {
                el.label = 'Exam Submitted ✓';
                el.disabled = true;
            } else {
                el.label = 'RETRY SAVE';
                el.disabled = false;
            }
        }
        this.render();
    }

    render() {
        const { ctx, canvasW, canvasH } = this;
        this._drawBackground();
        this._drawTitle('FLIGHT RESULTS');

        const padL   = 24;
        const padR   = canvasW - 24;
        const startY = 60;
        const rowH   = 42;

        if (this._results) {
            // ── Flight stats rows ─────────────────────────────────────────
            ROWS.forEach((row, i) => {
                const y      = startY + i * rowH;
                const val    = this._results[row.key];
                const valStr = `${val.toFixed(row.decimals)} ${row.unit}`;

                if (i % 2 === 0) {
                    ctx.fillStyle = 'rgba(34, 85, 238, 0.07)';
                    ctx.fillRect(padL, y + 2, padR - padL, rowH - 2);
                }

                ctx.fillStyle = '#8899cc';
                ctx.font = '17px Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(row.label, padL + 8, y + rowH / 2);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 17px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(valStr, padR - 8, y + rowH / 2);

                ctx.strokeStyle = 'rgba(34, 85, 238, 0.2)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(padL, y + rowH);
                ctx.lineTo(padR, y + rowH);
                ctx.stroke();
            });

            // ── Challenge score block ─────────────────────────────────────
            if (this._challengeScore) {
                const secY = startY + ROWS.length * rowH + 12;

                ctx.strokeStyle = 'rgba(255, 170, 34, 0.4)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(padL, secY); ctx.lineTo(padR, secY); ctx.stroke();

                ctx.fillStyle = '#ffaa22';
                ctx.font = 'bold 17px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('CHALLENGE SCORE', canvasW / 2, secY + 22);

                this._challengeScore.forEach((r, i) => {
                    const y = secY + 40 + i * 38;

                    if (i % 2 === 0) {
                        ctx.fillStyle = 'rgba(34, 85, 238, 0.07)';
                        ctx.fillRect(padL, y, padR - padL, 36);
                    }

                    ctx.fillStyle = r.passed ? '#44ff88' : '#ff5544';
                    ctx.font = 'bold 18px Arial';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(r.passed ? '✓' : '✗', padL + 8, y + 18);

                    ctx.fillStyle = '#8899cc';
                    ctx.font = '15px Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(r.label, padL + 32, y + 18);

                    const sign   = r.delta >= 0 ? '+' : '';
                    const valStr = `${r.actual.toFixed(r.decimals)} / ${r.target.toFixed(r.decimals)} ${r.unit} (${sign}${r.delta.toFixed(r.decimals)})`;
                    ctx.fillStyle = r.passed ? '#88ffaa' : '#ffaa88';
                    ctx.font = 'bold 13px Arial';
                    ctx.textAlign = 'right';
                    ctx.fillText(valStr, padR - 8, y + 18);
                });

                // Attempt count (URL-param mode only; exam mode shows question progress instead)
                if (!this._challengeManager?.isExamMode) {
                    const attemptY = secY + 40 + this._challengeScore.length * 38 + 18;
                    ctx.fillStyle = '#6677aa';
                    ctx.font = '14px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(`Attempt ${this._attemptCount}`, canvasW / 2, attemptY);
                }

                ctx.textBaseline = 'alphabetic';
            }

            this._drawSaveLine();
        }

        this.elements.forEach(el => {
            if (el.type === 'button') this._drawButton(el);
        });

        super.render();
    }

    /**
     * The save-status strip along the foot of the panel.
     *
     * Nothing is drawn before a submission is attempted — until then there is
     * genuinely nothing to report, and a permanent empty line would only add
     * noise to the free-play and mid-exam cases.
     */
    _drawSaveLine() {
        if (!this._saveStatus) return;

        const { ctx, canvasW, canvasH } = this;
        const baseY = canvasH - 58;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (this._saveStatus === 'submitting') {
            ctx.fillStyle = '#8899cc';
            ctx.font = '16px Arial';
            ctx.fillText('Saving scores…', canvasW / 2, baseY + 18);
        } else if (this._saveStatus === 'saved') {
            ctx.fillStyle = '#44ff88';
            ctx.font = 'bold 17px Arial';
            ctx.fillText('Scores saved.', canvasW / 2, baseY + 18);
        } else {
            ctx.fillStyle = '#ff5544';
            ctx.font = 'bold 17px Arial';
            ctx.fillText('SCORES NOT SAVED', canvasW / 2, baseY);

            ctx.fillStyle = '#ffaa88';
            ctx.font = '13px Arial';
            ctx.fillText(this._fitLine(this._saveError, canvasW - 32), canvasW / 2, baseY + 20);

            ctx.fillStyle = '#8899cc';
            ctx.font = '13px Arial';
            ctx.fillText('Press RETRY SAVE, or tell your teacher.', canvasW / 2, baseY + 38);
        }

        ctx.textBaseline = 'alphabetic';
    }

    /** Truncate to the panel width — the server's message is arbitrary length. */
    _fitLine(text, maxW) {
        const str = String(text ?? '');
        if (this.ctx.measureText(str).width <= maxW) return str;

        let cut = str;
        while (cut.length > 1 && this.ctx.measureText(`${cut}…`).width > maxW) {
            cut = cut.slice(0, -1);
        }
        return `${cut}…`;
    }

    _handleExamAction() {
        // A sitting the server has accepted is finished — but a failed one is
        // not, so this only latches on success. `main.js` guards the submit
        // itself, which is what makes a double-tap during the request safe.
        if (this._saveStatus === 'saved' || this._saveStatus === 'submitting') return;

        if (this._challengeManager.isLastQuestion) {
            // Disable immediately to swallow a double-tap; showSaveStatus takes
            // over the label from here, including reopening it for a retry.
            const el = this.elements.find(e => e.id === 'exam-action');
            if (el) el.disabled = true;
            this.render();
            this._onSubmit && this._onSubmit();
        } else {
            this._onNext && this._onNext();
        }
    }
}

// xr/VRHUDPanel.js
import { VRPanel, m } from './VRPanel.js';
import { COLOR, SIZE, LAYOUT, font } from '../ui/tokens.js';

const W = LAYOUT.right.w;
const PAD = SIZE.pad;
const INNER = W - PAD * 2;
const BASE_H = 0.64;
const TARGET_ROW = 0.035;

// Graph range, m/s² — the same mapping the desktop graph uses.
const A_MIN = -10, A_MAX = 20;

/**
 * Flight Data, to the student's right: live readouts, the acceleration graph,
 * a one-question understanding check, and — while a challenge is being graded —
 * its targets.
 *
 * This used to be two panels, a HUD straight ahead and a graph to the left. The
 * HUD sat directly in front of the rocket (B43); the graph took the spot the
 * launch pad needs. One spot, one panel.
 */
export class VRHUDPanel extends VRPanel {
    constructor(challengeManager = null) {
        super(W, BASE_H);
        this._state     = { velocity: 0, acceleration: 0, altitude: 0, fuel: 100 };
        this._challenge = challengeManager;
        this._showTargets = false;

        this._data = [];
        this._maxPts = 100;
        this._checkOpen = false;      // the check unlocks on the first launch
        this._answered = false;
        this._correct = false;

        this._layoutButtons();
        this.render();
    }

    /** Show or hide the challenge targets — only while a flight is being graded. */
    setShowTargets(show) {
        this._showTargets = show && !!this._challenge?.isActive;
        const n = this._showTargets ? this._challenge.targets.length : 0;
        const h = BASE_H + (this._showTargets ? 0.02 + 0.04 + n * TARGET_ROW : 0);
        if (Math.abs(h - this.worldH) > 1e-6) {
            this.resize(W, h);
            this._layoutButtons();
        }
        this.render();
    }

    updateStats(state) {
        this._state = state;
        // Powered flight only — see UIManager.updateHUD.
        if (state.isLaunched && !state.isCoasting) {
            this._data.push(state.acceleration);
            if (this._data.length > this._maxPts) this._data.shift();
            this._checkOpen = true;
        }
        this._syncButtons();
        this.render();
    }

    reset() {
        this._data = [];
        this._checkOpen = false;
        this._answered = false;
        this._syncButtons();
        this.render();
    }

    _layoutButtons() {
        this.clearElements();
        const bw = (INNER - SIZE.gap) / 2;
        this.addButton('ans_up',   'Increases', m(PAD), m(0.535), m(bw), m(SIZE.buttonH), () => this._answer(false));
        this.addButton('ans_down', 'Decreases', m(PAD + bw + SIZE.gap), m(0.535), m(bw), m(SIZE.buttonH), () => this._answer(true));
        this._syncButtons();
    }

    _syncButtons() {
        const off = !this._checkOpen || this._answered;
        this.setDisabled('ans_up', off);
        this.setDisabled('ans_down', off);
    }

    _answer(correct) {
        if (this._answered) return;
        this._answered = true;
        this._correct = correct;
        this._syncButtons();
        this.render();
    }

    render() {
        const { ctx } = this;
        this._drawBackground();
        this._drawTitle('Flight Data');

        // ── Readouts, 2 × 2 ──────────────────────────────────────────────
        const s = this._state;
        const cellW = (INNER - SIZE.gap) / 2;
        const cells = [
            ['Velocity',     `${s.velocity?.toFixed(2)} m/s`],
            ['Acceleration', `${s.acceleration?.toFixed(2)} m/s²`],
            ['Altitude',     `${s.altitude?.toFixed(2)} m`],
            ['Fuel',         `${s.fuel?.toFixed(1)}%`],
        ];
        cells.forEach(([label, value], i) => {
            const x = PAD + (i % 2) * (cellW + SIZE.gap);
            const y = 0.09 + Math.floor(i / 2) * 0.085;
            ctx.fillStyle = COLOR.surface;
            this._rr(m(x), m(y), m(cellW), m(0.075), m(0.01));
            ctx.fill();
            this._drawText(label, m(x + 0.012), m(y + 0.008), { size: SIZE.bodyMin, color: COLOR.textMuted, maxLines: 1 });
            const low = label === 'Fuel' && s.fuel < 20;
            this._drawText(value, m(x + 0.012), m(y + 0.036), {
                size: SIZE.heading, weight: 700, color: low ? COLOR.error : COLOR.textPrimary, maxLines: 1,
            });
        });

        this._renderGraph(PAD, 0.27, INNER, 0.16);
        this._renderCheck();
        if (this._showTargets) this._renderTargets();

        if (this._checkOpen && !this._answered) {
            for (const el of this.elements) this._drawButton(el);
        }
        super.render();
    }

    _renderGraph(x0, y0, w0, h0) {
        const { ctx } = this;
        const gx = m(x0), gy = m(y0), gw = m(w0), gh = m(h0);
        const yOf = a => gy + gh - ((a - A_MIN) / (A_MAX - A_MIN)) * gh;

        ctx.fillStyle = '#0C0A09';
        this._rr(gx, gy, gw, gh, m(0.008));
        ctx.fill();

        ctx.strokeStyle = COLOR.surface;
        ctx.lineWidth = 1;
        for (const a of [-10, 10, 20]) {
            ctx.beginPath(); ctx.moveTo(gx, yOf(a)); ctx.lineTo(gx + gw, yOf(a)); ctx.stroke();
        }
        ctx.strokeStyle = COLOR.panelBorder;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(gx, yOf(0)); ctx.lineTo(gx + gw, yOf(0)); ctx.stroke();

        ctx.font = font(400, m(SIZE.bodyMin));
        ctx.fillStyle = COLOR.textMuted;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        for (const a of [0, 10]) ctx.fillText(String(a), gx + gw - m(0.008), yOf(a) - m(0.012));
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('Acceleration (m/s²) over time', gx + m(0.01), gy + m(0.006));
        ctx.textBaseline = 'alphabetic';

        if (this._data.length > 1) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(gx, gy, gw, gh);
            ctx.clip();
            ctx.strokeStyle = COLOR.accent;
            ctx.lineWidth = 3;
            ctx.beginPath();
            this._data.forEach((a, i) => {
                const x = gx + (i / this._maxPts) * gw;
                i === 0 ? ctx.moveTo(x, yOf(a)) : ctx.lineTo(x, yOf(a));
            });
            ctx.stroke();
            ctx.restore();
        }
    }

    _renderCheck() {
        const y = m(0.45);
        if (!this._checkOpen) {
            this._drawText('Launch the rocket to see the graph and a quick check.', m(PAD), y,
                { color: COLOR.textMuted, maxLines: 2 });
            return;
        }
        this._drawText('Mass goes up, thrust stays the same. What happens to acceleration?', m(PAD), y,
            { color: COLOR.textPrimary, weight: 600, maxLines: 2, lineH: 1.2 });
        if (this._answered) {
            this._drawText(this._correct ? 'Correct! a = F ÷ m' : 'Not quite: it decreases. a = F ÷ m',
                m(PAD), m(0.535), { weight: 700, color: this._correct ? COLOR.success : COLOR.error, maxLines: 1 });
            this._drawText('More mass → more inertia → less acceleration.', m(PAD), m(0.57),
                { size: SIZE.bodyMin, color: COLOR.textMuted, maxLines: 1 });
        }
    }

    _renderTargets() {
        const { ctx } = this;
        const top = BASE_H;
        ctx.strokeStyle = COLOR.panelBorder;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(m(PAD), m(top)); ctx.lineTo(m(W - PAD), m(top)); ctx.stroke();

        const progress = this._challenge.isExamMode
            ? `Question ${this._challenge.questionProgress.current} of ${this._challenge.questionProgress.total}`
            : null;
        this._drawText('Challenge Targets', m(PAD), m(top + 0.015), { weight: 700, color: COLOR.accent, maxLines: 1 });
        if (progress) {
            this._drawText(progress, m(W - PAD), m(top + 0.015), { color: COLOR.textMuted, align: 'right', maxLines: 1, maxW: m(0.25) });
        }

        this._challenge.targets.forEach((t, i) => {
            const y = m(top + 0.06 + i * TARGET_ROW);
            this._drawText(t.label, m(PAD), y, { maxLines: 1 });
            this._drawText(`≥ ${t.value.toFixed(t.decimals)} ${t.unit}`, m(W - PAD), y,
                { weight: 700, color: COLOR.textPrimary, align: 'right', maxLines: 1, maxW: m(0.25) });
        });
    }
}

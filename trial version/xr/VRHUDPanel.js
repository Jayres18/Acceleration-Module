// xr/VRHUDPanel.js
import { VRPanel } from './VRPanel.js';

// Canvas: 512 × (260 + extraH)   World: 0.90 × dynamic
// extraH = 38 + targets.length * 28 + 10 when challenge is active
export class VRHUDPanel extends VRPanel {
    constructor(challengeManager = null, isTrial = false) {
        const extraH = challengeManager?.isActive
            ? 38 + challengeManager.targets.length * 28 + 10
            : 0;
        const canvasH = 260 + extraH;
        const worldH  = 0.46 + extraH * (0.46 / 260);
        super(0.90, worldH, 512, canvasH);

        this._state      = { velocity: 0, acceleration: 0, altitude: 0, fuel: 100 };
        this._challenge  = challengeManager;
        // The trial mark is drawn into this panel rather than given one of its
        // own: this panel is always visible and centred, and the VR layout is
        // tight already now the chase monitor has been enlarged.
        this._isTrial    = isTrial;
        this._trialEnded = false;
        this.render();
    }

    updateStats(state) {
        this._state = state;
        this.render();
    }

    /** Trial quota spent — say so where the student is already looking. */
    setTrialEnded(ended) {
        this._trialEnded = ended;
        this.render();
    }

    /** TRIAL chip in the title row, and the end notice once the quota is gone. */
    _drawTrialMark() {
        const { ctx, canvasW } = this;

        ctx.fillStyle = this._trialEnded ? '#aa3322' : '#553311';
        this._rr(canvasW - 96, 18, 76, 26, 6);
        ctx.fill();

        ctx.fillStyle = '#ffcc66';
        ctx.font = 'bold 15px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TRIAL', canvasW - 58, 32);
        ctx.textBaseline = 'alphabetic';

        if (this._trialEnded) {
            ctx.fillStyle = '#ff8866';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('TRIAL COMPLETE — launches used up', canvasW / 2, 62);
        }
    }

    render() {
        const { ctx, canvasW } = this;
        this._drawBackground();
        this._drawTitle('FLIGHT DATA');
        if (this._isTrial) this._drawTrialMark();

        // ── 2×2 flight data grid ──────────────────────────────────────────
        const items = [
            { label: 'Velocity',     value: this._state.velocity?.toFixed(2) + ' m/s',      x: 20,               y: 90  },
            { label: 'Acceleration', value: this._state.acceleration?.toFixed(2) + ' m/s²', x: canvasW / 2 + 10, y: 90  },
            { label: 'Altitude',     value: this._state.altitude?.toFixed(2) + ' m',         x: 20,               y: 175 },
            { label: 'Fuel',         value: this._state.fuel?.toFixed(1) + '%',              x: canvasW / 2 + 10, y: 175 },
        ];

        for (const item of items) {
            ctx.fillStyle = '#6688bb';
            ctx.font = '17px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(item.label, item.x, item.y);

            const isLow = item.label === 'Fuel' && this._state.fuel < 20;
            ctx.fillStyle = isLow ? '#ff6644' : '#ffffff';
            ctx.font = 'bold 28px Arial';
            ctx.fillText(item.value, item.x, item.y + 38);
        }

        // Dividers
        ctx.strokeStyle = '#1a2255';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(canvasW / 2, 60); ctx.lineTo(canvasW / 2, 246); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(14, 140); ctx.lineTo(canvasW - 14, 140); ctx.stroke();

        // ── Challenge targets section ──────────────────────────────────────
        if (this._challenge?.isActive) {
            const startY = 267;

            ctx.strokeStyle = 'rgba(255, 170, 34, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(14, startY); ctx.lineTo(canvasW - 14, startY); ctx.stroke();

            // "CHALLENGE TARGETS" heading (left-aligned)
            ctx.fillStyle = '#ffaa22';
            ctx.font = 'bold 15px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('CHALLENGE TARGETS', 20, startY + 22);

            // "Q X / N" progress badge (right-aligned, exam mode only)
            if (this._challenge.isExamMode) {
                const { current, total } = this._challenge.questionProgress;
                ctx.fillStyle = '#aabbff';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(`Q ${current} / ${total}`, canvasW - 20, startY + 22);
            }

            this._challenge.targets.forEach((t, i) => {
                const y = startY + 40 + i * 28;
                ctx.fillStyle = '#888899';
                ctx.font = '13px Arial';
                ctx.textAlign = 'left';
                ctx.fillText(`${t.label}:`, 20, y);
                ctx.fillStyle = '#ffcc44';
                ctx.font = 'bold 13px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(`≥ ${t.value.toFixed(t.decimals)} ${t.unit}`, canvasW - 20, y);
            });
        }

        super.render();
    }
}

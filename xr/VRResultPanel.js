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
    return 12 + 40 + challengeManager.targets.length * 38 + 40;
}

export class VRResultPanel extends VRPanel {
    constructor(onClose, challengeManager = null) {
        const extraH  = challengeExtraH(challengeManager);
        const canvasH = 428 + extraH;
        const worldH  = canvasH * (0.75 / 428);
        super(0.90, worldH, 512, canvasH);

        this._results        = null;
        this._challengeScore = null;
        this._attemptCount   = 0;

        this.addButton('close', 'CLOSE', 156, canvasH - 54, 200, 40, onClose, {});
        this.render();
    }

    setResults(results, challengeScore = null, attemptCount = 0) {
        this._results        = results;
        this._challengeScore = challengeScore;
        this._attemptCount   = attemptCount;
        this.render();
    }

    render() {
        const { ctx, canvasW } = this;
        this._drawBackground();
        this._drawTitle('FLIGHT RESULTS');

        const padL   = 24;
        const padR   = canvasW - 24;
        const startY = 60;
        const rowH   = 42;

        if (this._results) {
            // ── Flight stats rows ────────────────────────────────────────
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

            // ── Challenge score block ────────────────────────────────────
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

                const attemptY = secY + 40 + this._challengeScore.length * 38 + 18;
                ctx.fillStyle = '#6677aa';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`Attempt ${this._attemptCount}`, canvasW / 2, attemptY);

                ctx.textBaseline = 'alphabetic';
            }
        }

        this.elements.forEach(el => {
            if (el.type === 'button') this._drawButton(el);
        });

        super.render();
    }
}

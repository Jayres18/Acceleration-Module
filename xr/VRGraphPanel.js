import { VRPanel } from './VRPanel.js';

// Canvas: 512 × 560   World: 0.65 × 0.70 m
// Shows a live acceleration graph and a post-launch quiz.
export class VRGraphPanel extends VRPanel {
    constructor() {
        super(0.65, 0.70, 512, 560);
        this._data = [];
        this._maxPts = 100;
        this._quizVisible = false;
        this._quizAnswered = false;
        this._quizCorrect = false;

        // Quiz buttons (canvas px)
        this.addButton('ans_up',   'Increases', 30,  390, 202, 55, () => this._answer(false));
        this.addButton('ans_down', 'Decreases', 278, 390, 202, 55, () => this._answer(true));

        // Hide quiz buttons until launched
        this.setDisabled('ans_up', true);
        this.setDisabled('ans_down', true);

        this.render();
    }

    pushData(state) {
        if (state.isLaunched) {
            this._data.push(state.acceleration);
            if (this._data.length > this._maxPts) this._data.shift();
            if (!this._quizVisible) {
                this._quizVisible = true;
                this.setDisabled('ans_up', false);
                this.setDisabled('ans_down', false);
            }
        }
        this.render();
    }

    reset() {
        this._data = [];
        this._quizVisible = false;
        this._quizAnswered = false;
        this.setDisabled('ans_up', true);
        this.setDisabled('ans_down', true);
        this.render();
    }

    _answer(correct) {
        if (this._quizAnswered) return;
        this._quizAnswered = true;
        this._quizCorrect = correct;
        this.setDisabled('ans_up', true);
        this.setDisabled('ans_down', true);
        this.render();
    }

    render() {
        const { ctx, canvasW } = this;
        this._drawBackground();
        this._drawTitle('ACCELERATION GRAPH');

        // ── Graph area ────────────────────────────────────────────────
        const gx = 34, gy = 58, gw = canvasW - 68, gh = 230;

        ctx.fillStyle = '#05050f';
        ctx.fillRect(gx, gy, gw, gh);

        // Grid
        ctx.strokeStyle = '#151530';
        ctx.lineWidth = 1;
        for (let i = 1; i < 5; i++) {
            const y = gy + (gh / 5) * i;
            ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + gw, y); ctx.stroke();
        }
        for (let i = 1; i < 5; i++) {
            const x = gx + (gw / 5) * i;
            ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + gh); ctx.stroke();
        }

        // Zero line
        const zeroY = gy + gh - (10 / 30) * gh; // maps 0 m/s² from [-10..20] range
        ctx.strokeStyle = '#334466';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(gx, zeroY); ctx.lineTo(gx + gw, zeroY); ctx.stroke();
        ctx.fillStyle = '#445577';
        ctx.font = '13px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('0', gx + 3, zeroY - 3);

        // Y-axis labels
        ctx.fillStyle = '#556688';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ['-10', '0', '10', '20'].forEach((lbl, i) => {
            const y = gy + gh - (([0, 10, 20, 30][i]) / 30) * gh;
            ctx.fillText(lbl, gx - 4, y + 4);
        });

        // Data curve
        if (this._data.length > 1) {
            ctx.strokeStyle = '#33aaff';
            ctx.lineWidth = 2.5;
            ctx.shadowColor = '#33aaff';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            this._data.forEach((val, i) => {
                const x = gx + (i / this._maxPts) * gw;
                const y = gy + gh - ((val + 10) / 30) * gh;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Axes labels
        ctx.fillStyle = '#7799aa';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('m/s²', gx + 2, gy + 14);
        ctx.textAlign = 'right';
        ctx.fillText('time →', gx + gw, gy + gh + 16);

        // ── Quiz section ──────────────────────────────────────────────
        if (this._quizVisible) {
            ctx.fillStyle = '#aabbdd';
            ctx.font = 'bold 17px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('If mass ↑ but thrust stays the same,', canvasW / 2, 320);
            ctx.fillText('what happens to acceleration?', canvasW / 2, 345);

            if (!this._quizAnswered) {
                for (const el of this.elements) {
                    if (el.type === 'button') this._drawButton(el);
                }
            } else {
                const color = this._quizCorrect ? '#44ff88' : '#ff5544';
                const msg   = this._quizCorrect
                    ? '✓ Correct!  a = F ÷ m'
                    : '✗ Decreases — a = F ÷ m';
                ctx.fillStyle = color;
                ctx.font = 'bold 22px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(msg, canvasW / 2, 430);
                ctx.fillStyle = '#889aaa';
                ctx.font = '15px Arial';
                ctx.fillText('More mass → more inertia → less acceleration', canvasW / 2, 460);
            }
        } else {
            ctx.fillStyle = '#445566';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Launch the rocket to see data', canvasW / 2, 350);
        }

        super.render();
    }
}

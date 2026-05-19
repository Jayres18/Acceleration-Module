import { VRPanel } from './VRPanel.js';

// Canvas: 512 × 370   World: 0.90 × 0.65 m
// Purely informational — no interactive elements.
// Shown at VR session start; any pinch dismisses it (handled by XRHandler).
export class VRInstructionPanel extends VRPanel {
    constructor() {
        super(0.90, 0.65, 512, 370);
        this.render();
    }

    render() {
        const { ctx, canvasW } = this;
        this._drawBackground();
        this._drawTitle('HOW TO USE');

        // ── F = ma section ──────────────────────────────────────────────
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';

        ctx.fillStyle = '#4499ff';
        ctx.font = 'bold 20px Arial';
        ctx.fillText("Newton's Second Law", canvasW / 2, 72);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Arial';
        ctx.fillText('F = ma', canvasW / 2, 100);

        ctx.fillStyle = '#ccddff';
        ctx.font = '15px Arial';
        ctx.fillText('More Thrust  →  More Acceleration', canvasW / 2, 122);
        ctx.fillText('More Mass    →  Less  Acceleration', canvasW / 2, 141);

        // ── Panel map section ────────────────────────────────────────────
        ctx.fillStyle = '#4499ff';
        ctx.font = 'bold 17px Arial';
        ctx.fillText('YOUR PANELS', canvasW / 2, 165);

        ctx.fillStyle = '#aabbcc';
        ctx.font = '15px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('◄  LEFT    –  Acceleration graph + quiz', 44, 185);
        ctx.fillText('▮  CENTER  –  Live flight data',           44, 203);
        ctx.fillText('►  RIGHT   –  Launch controls & sliders',  44, 221);

        // ── Horizontal rule ──────────────────────────────────────────────
        ctx.strokeStyle = '#1a2255';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(20, 232);
        ctx.lineTo(492, 232);
        ctx.stroke();

        // ── Pinch-to-dismiss cue box ─────────────────────────────────────
        ctx.fillStyle = 'rgba(0, 80, 200, 0.35)';
        this._rr(30, 240, 452, 36, 9);
        ctx.fill();
        ctx.strokeStyle = '#2255ee';
        ctx.lineWidth = 1.5;
        this._rr(30, 240, 452, 36, 9);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PINCH ANYWHERE TO DISMISS', canvasW / 2, 258);
        ctx.textBaseline = 'alphabetic';

        // ── Sub-cues ─────────────────────────────────────────────────────
        ctx.fillStyle = '#8899bb';
        ctx.font = '14px Arial';
        ctx.fillText('Point your hand at a panel and pinch to interact', canvasW / 2, 296);

        ctx.fillStyle = '#556677';
        ctx.font = '13px Arial';
        ctx.fillText('✋  pinch = select  |  hold + move = drag sliders', canvasW / 2, 318);

        super.render();
    }
}

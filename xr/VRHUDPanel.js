import { VRPanel } from './VRPanel.js';

// Canvas: 512 × 260   World: 0.90 × 0.46 m
// Displays four live flight values in a 2×2 grid.
export class VRHUDPanel extends VRPanel {
    constructor() {
        super(0.90, 0.46, 512, 260);
        this._state = { velocity: 0, acceleration: 0, altitude: 0, fuel: 100 };
        this.render();
    }

    updateStats(state) {
        this._state = state;
        this.render();
    }

    render() {
        const { ctx, canvasW, canvasH } = this;
        this._drawBackground();
        this._drawTitle('FLIGHT DATA');

        const items = [
            { label: 'Velocity',     value: this._state.velocity?.toFixed(2) + ' m/s',   x: 20,          y: 90 },
            { label: 'Acceleration', value: this._state.acceleration?.toFixed(2) + ' m/s²', x: canvasW / 2 + 10, y: 90 },
            { label: 'Altitude',     value: this._state.altitude?.toFixed(2) + ' m',      x: 20,          y: 175 },
            { label: 'Fuel',         value: this._state.fuel?.toFixed(1) + '%',            x: canvasW / 2 + 10, y: 175 },
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
        // vertical centre
        ctx.beginPath(); ctx.moveTo(canvasW / 2, 60); ctx.lineTo(canvasW / 2, canvasH - 14); ctx.stroke();
        // horizontal centre
        ctx.beginPath(); ctx.moveTo(14, 140); ctx.lineTo(canvasW - 14, 140); ctx.stroke();

        super.render();
    }
}

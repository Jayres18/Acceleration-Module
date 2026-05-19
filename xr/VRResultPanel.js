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

export class VRResultPanel extends VRPanel {
    constructor(onClose) {
        super(0.90, 0.75, 512, 428);
        this._results = null;

        this.addButton('close', 'CLOSE', 156, 374, 200, 40, onClose, {});
        this.render();
    }

    setResults(results) {
        this._results = results;
        this.render();
    }

    render() {
        const { ctx, canvasW } = this;
        this._drawBackground();
        this._drawTitle('FLIGHT RESULTS');

        if (this._results) {
            const rowH = 42;
            const startY = 60;
            const padL = 24;
            const padR = canvasW - 24;

            ROWS.forEach((row, i) => {
                const y = startY + i * rowH;
                const val = this._results[row.key];
                const valStr = `${val.toFixed(row.decimals)} ${row.unit}`;

                // Alternating row tint
                if (i % 2 === 0) {
                    ctx.fillStyle = 'rgba(34, 85, 238, 0.07)';
                    ctx.fillRect(padL, y + 2, padR - padL, rowH - 2);
                }

                // Label
                ctx.fillStyle = '#8899cc';
                ctx.font = '17px Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(row.label, padL + 8, y + rowH / 2);

                // Value
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 17px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(valStr, padR - 8, y + rowH / 2);

                // Divider
                ctx.strokeStyle = 'rgba(34, 85, 238, 0.2)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(padL, y + rowH);
                ctx.lineTo(padR, y + rowH);
                ctx.stroke();
            });
        }

        this.elements.forEach(el => {
            if (el.type === 'button') this._drawButton(el);
        });

        super.render();
    }
}

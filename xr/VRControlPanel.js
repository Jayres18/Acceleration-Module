import { VRPanel } from './VRPanel.js';

// Canvas: 512 × 640   World: 0.65 × 0.80 m
//
// Layout (canvas pixels, y=0 at top):
//   Title        y 0–50
//   Thrust       y 60–135
//   Mass         y 155–230
//   Time Scale   y 250–325
//   LAUNCH btn   y 360–430
//   RESET btn    y 450–510
export class VRControlPanel extends VRPanel {
    constructor(callbacks) {
        super(0.65, 0.80, 512, 640);

        const P = 46;   // horizontal padding
        const W = 512 - P * 2;  // slider/button width = 420

        // Sliders — args: id, label, x, y, w, h, min, max, value, callback
        this.addSlider('thrust', 'Thrust (N)', P, 60, W, 75,   0, 200, 50,  v => callbacks.onThrustChange(v));
        this.addSlider('mass',   'Mass (kg)',  P, 155, W, 75,  1,  50, 10,  v => callbacks.onMassChange(v));
        this.addSlider('time',   'Time Scale', P, 250, W, 75, 0.1, 2.0, 1.0, v => callbacks.onTimeChange(v));

        // Buttons — args: id, label, x, y, w, h, callback, style
        this.addButton('launch', 'LAUNCH',  P, 360, W, 70, () => {
            if (!this.elements.find(e => e.id === 'launch').disabled) {
                callbacks.onLaunch();
                this.setDisabled('launch', true);
                this.render();
            }
        });
        this.addButton('reset', 'RESET', P, 450, W, 60, () => {
            callbacks.onReset();
            this.setDisabled('launch', false);
            this.render();
        }, { secondary: true });

        this.render();
    }

    render() {
        const { ctx, canvasW } = this;
        this._drawBackground();
        this._drawTitle('LAUNCH CONTROLS');

        for (const el of this.elements) {
            if (el.type === 'slider') this._drawSlider(el);
            else if (el.type === 'button') this._drawButton(el);
        }

        // Separator lines
        ctx.strokeStyle = '#1a2255';
        ctx.lineWidth = 1;
        [148, 243, 345].forEach(yy => {
            ctx.beginPath();
            ctx.moveTo(30, yy);
            ctx.lineTo(canvasW - 30, yy);
            ctx.stroke();
        });

        super.render();
    }
}

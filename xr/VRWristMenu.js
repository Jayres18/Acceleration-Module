// xr/VRWristMenu.js
import { VRPanel, m } from './VRPanel.js';
import { SIZE, COLOR } from '../ui/tokens.js';

const BW = 0.135;
const W = SIZE.pad * 2 + BW * 2 + SIZE.gap;
const H = SIZE.pad * 2 + 0.045 + SIZE.buttonH * 2 + SIZE.gap;

/**
 * The wrist menu (spec §5, §7): the same Back · Menu · Reset · Exit as the
 * main panel's bar, held at the student's wrist. Opened by turning a palm up,
 * or with X / Y on the left controller; positioned every frame by XRHandler.
 */
export class VRWristMenu extends VRPanel {
    constructor(nav) {
        super(W, H);
        // The pivot sits at the panel's centre here, not its top edge — it is
        // placed at a point above the wrist, and that point should be its middle.
        this.mesh.position.y = 0;

        const x0 = m(SIZE.pad), x1 = m(SIZE.pad + BW + SIZE.gap);
        const y0 = m(SIZE.pad + 0.045), y1 = y0 + m(SIZE.buttonH + SIZE.gap);
        const bw = m(BW), bh = m(SIZE.buttonH);
        this.addButton('nav-back',  'Back',  x0, y0, bw, bh, nav.back,  { icon: 'back' });
        this.addButton('nav-menu',  'Menu',  x1, y0, bw, bh, nav.menu,  { icon: 'menu' });
        this.addButton('nav-reset', 'Reset', x0, y1, bw, bh, nav.reset, { icon: 'reset' });
        this.addButton('nav-exit',  'Exit',  x1, y1, bw, bh, nav.exit,  { icon: 'exit', variant: 'danger' });

        this.visible = false;
        this.render();
    }

    /** Mirror the main panel's Back / Menu availability. */
    setEnabled({ back, menu }) {
        this.setDisabled('nav-back', !back);
        this.setDisabled('nav-menu', !menu);
        this.render();
    }

    render() {
        this._drawBackground();
        this._drawText('Menu', m(SIZE.pad), m(SIZE.pad - 0.004), {
            size: SIZE.heading, weight: 700, color: COLOR.textPrimary, maxLines: 1,
        });
        this.elements.forEach(el => this._drawButton(el));
        super.render();
    }
}

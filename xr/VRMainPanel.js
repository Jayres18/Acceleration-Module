// xr/VRMainPanel.js
import { VRPanel, m } from './VRPanel.js';
import { COLOR, SIZE, LAYOUT } from '../ui/tokens.js';

const W = LAYOUT.main.w;
const H = LAYOUT.main.h;
const PAD = SIZE.pad;
const INNER = W - PAD * 2;          // 0.84 m
const COL = (INNER - SIZE.gap * 2) / 3;

/**
 * Guided steps for Learn (spec §6). Each is at most three lines.
 * The last one hands over to the controls.
 */
const LEARN = [
    {
        title: 'Your Lab',
        body: 'The rocket stands on the launch pad to your left. Flight Data is on your right. You set up and launch from this panel.',
    },
    {
        title: "Newton's Second Law",
        big: 'F = m × a',
        body: 'Acceleration = net force ÷ mass. Net force = thrust − weight, and weight = mass × 9.81.',
    },
    {
        title: 'More Thrust',
        body: 'Keep the mass and raise the thrust. The rocket speeds up faster: acceleration goes up.',
    },
    {
        title: 'More Mass',
        body: 'Keep the thrust and raise the mass. Acceleration goes down. If weight beats thrust, the rocket stays on the pad.',
    },
];

/** How to Use (spec §8): every step names the hand AND the controller. */
const HOW_TO = [
    { verb: 'Point',  text: 'Aim your hand or controller at a panel. A ray and dot appear.' },
    { verb: 'Select', text: 'Pinch thumb and index finger, or pull the trigger. Release to press.' },
    { verb: 'Drag',   text: 'Pinch and hold, or hold the trigger, then move to set a slider.' },
    { verb: 'Menu',   text: 'Palm up, or X / Y on the left controller, opens Back, Menu, Reset, Exit.' },
];

export const LEARN_STEPS = LEARN.length;

/**
 * The main panel, straight ahead of the student. One panel, many screens —
 * only one thing ever occupies this spot (spec §3), and every screen carries
 * the same navigation bar.
 *
 * Screens: loading · start · howto · learn-0…3 · explore · quiz · exit
 */
export class VRMainPanel extends VRPanel {
    /**
     * @param {object} o
     * @param {object} o.callbacks   RocketApp callbacks (thrust, mass, time, launch)
     * @param {object} o.nav         { back, menu, reset, exit }
     * @param {object} o.actions     { go(screen), back(), toggleNarration(), leave() }
     * @param {object} o.challenge   ChallengeManager
     * @param {boolean} o.isExam     an exam sitting — shows Quiz on the start panel
     */
    constructor({ callbacks, nav, actions, challenge, isExam }) {
        super(W, H);
        this._callbacks = callbacks;
        this._nav       = nav;
        this._actions   = actions;
        this._challenge = challenge;
        this._isExam    = isExam;

        // Must stay in step with the defaults in index.html and main.js.
        this._values = { thrust: 150, mass: 10, time: 1.0 };
        this._launchEnabled = true;
        this._status = null;          // { text, color } under the Launch button
        this._narrationOn = true;
        this._examWarning = false;    // exit screen: unsaved exam answers

        this.screen = 'loading';
        this.show('loading');
    }

    // ── State pushed in from XRHandler / RocketApp ─────────────────────

    setLaunchEnabled(enabled) {
        this._launchEnabled = enabled;
        this.setDisabled('launch', !enabled);
        this.render();
    }

    /** One line under Launch: why it failed, or null to clear. */
    setStatus(text, color = COLOR.error) {
        this._status = text ? { text, color } : null;
        this.render();
    }

    setNarration(on) {
        this._narrationOn = on;
        const el = this.getElement('narration');
        if (el) el.label = `Narration: ${on ? 'On' : 'Off'}`;
        this.render();
    }

    setExamWarning(on) {
        this._examWarning = on;
        if (this.screen === 'exit') this.render();
    }

    // ── Screens ────────────────────────────────────────────────────────

    show(screen, { canGoBack = true } = {}) {
        this.screen = screen;
        this.clearElements();
        const nav = { back: canGoBack, menu: screen !== 'start', reset: true };

        if (screen === 'loading') {
            nav.back = nav.menu = nav.reset = false;
        } else if (screen === 'start') {
            this._buildStart();
            nav.back = false;
        } else if (screen === 'howto') {
            this.addButton('gotit', 'Got It', m(W - PAD - 0.2), m(0.425), m(0.2), m(SIZE.buttonH),
                () => this._actions.back(), { variant: 'primary' });
        } else if (screen.startsWith('learn-')) {
            this._buildLearn(Number(screen.slice(6)));
        } else if (screen === 'explore' || screen === 'quiz') {
            this._buildControls();
        } else if (screen === 'exit') {
            const y = m(0.29);
            this.addButton('stay',  'Stay',  m(PAD), y, m(COL), m(0.07), () => this._actions.back());
            this.addButton('leave', 'Leave', m(PAD + COL + SIZE.gap), y, m(COL), m(0.07),
                () => this._actions.leave(), { variant: 'danger' });
        }

        this._addNavBar(this._nav, nav);
        this.render();
    }

    _buildStart() {
        const y1 = m(0.2), y2 = m(0.29), h = m(0.075);
        const x = i => m(PAD + i * (COL + SIZE.gap));
        const go = s => () => this._actions.go(s);

        this.addButton('howto',   'How to Use', x(0), y1, m(COL), h, go('howto'));
        this.addButton('learn',   'Learn',      x(1), y1, m(COL), h, go('learn-0'));
        this.addButton('explore', 'Explore',    x(2), y1, m(COL), h, go('explore'));

        // Quiz only in an exam sitting (spec §6); otherwise it is simply absent.
        let col = 0;
        if (this._isExam) this.addButton('quiz', 'Quiz', x(col++), y2, m(COL), h, go('quiz'));
        this.addButton('narration', `Narration: ${this._narrationOn ? 'On' : 'Off'}`,
            x(col), y2, m(COL), h, () => this._actions.toggleNarration());
    }

    _buildLearn(i) {
        const last = i === LEARN.length - 1;
        this.addButton('next', last ? 'Start Flying' : 'Next',
            m(W - PAD - 0.24), m(0.43), m(0.24), m(SIZE.buttonH),
            () => this._actions.go(last ? 'explore' : `learn-${i + 1}`),
            { variant: last ? 'primary' : 'secondary' });
    }

    _buildControls() {
        const x = m(PAD), w = m(INNER), h = m(0.07);
        const v = this._values;
        this.addSlider('thrust', 'Thrust', x, m(0.095), w, h, 0, 200, v.thrust, val => {
            v.thrust = val; this._callbacks.onThrustChange(val);
        }, val => `${Math.round(val)} N`);
        this.addSlider('mass', 'Mass', x, m(0.175), w, h, 1, 50, v.mass, val => {
            v.mass = val; this._callbacks.onMassChange(val);
        }, val => `${Math.round(val)} kg`);
        this.addSlider('time', 'Time Scale', x, m(0.255), w, h, 0.1, 2.0, v.time, val => {
            v.time = val; this._callbacks.onTimeChange(val);
        }, val => `${val.toFixed(1)}×`);

        this.addButton('launch', 'Launch', x, m(0.345), w, m(0.07), () => {
            if (!this._launchEnabled) return;
            this.setLaunchEnabled(false);
            this.setStatus(null);
            this._callbacks.onLaunch();
        }, { variant: 'primary' });
        this.setDisabled('launch', !this._launchEnabled);
    }

    // ── Rendering ──────────────────────────────────────────────────────

    render() {
        const { ctx } = this;
        this._drawBackground();
        const s = this.screen;

        if (s === 'loading') {
            const y = this._drawTitle('Loading…');
            this._drawText('Getting the rocket ready.', m(PAD), y);
        } else if (s === 'start') {
            const y = this._drawTitle('Acceleration');
            this._drawText('Launch a rocket and see how force and mass change its acceleration.',
                m(PAD), y, { maxLines: 2 });
            if (this._isExam) {
                this._drawText('This is an exam sitting. Choose Quiz to answer the questions.',
                    m(PAD), m(0.39), { color: COLOR.textMuted, maxLines: 2 });
            }
        } else if (s === 'howto') {
            this._renderHowTo();
        } else if (s.startsWith('learn-')) {
            this._renderLearn(Number(s.slice(6)));
        } else if (s === 'explore' || s === 'quiz') {
            this._renderControls();
        } else if (s === 'exit') {
            const y = this._drawTitle('Leave the simulation?');
            const msg = this._examWarning
                ? "Unanswered questions won't be saved."
                : 'You will go back to the portal.';
            this._drawText(msg, m(PAD), y, { color: this._examWarning ? COLOR.error : COLOR.textSecondary });
        }

        for (const el of this.elements) {
            if (el.type === 'slider') this._drawSlider(el);
            else this._drawButton(el);
        }
        ctx.textBaseline = 'alphabetic';
        super.render();
    }

    _renderHowTo() {
        const { ctx } = this;
        let y = this._drawTitle('How to Use');
        const rowH = m(0.08);
        const icon = m(0.04);
        HOW_TO.forEach((step, i) => {
            const top = y + i * rowH;
            if (i % 2 === 0) {
                ctx.fillStyle = COLOR.surface;
                this._rr(m(PAD), top, m(INNER), rowH - m(0.005), m(0.01));
                ctx.fill();
            }
            const cy = top + rowH / 2 - m(0.002);
            this._drawIcon('hand', m(PAD + 0.035), cy, icon, COLOR.textSecondary);
            this._drawIcon('controller', m(PAD + 0.09), cy, icon, COLOR.textSecondary);
            this._drawText(step.verb, m(PAD + 0.13), top + m(0.022), { weight: 700, color: COLOR.textPrimary, maxLines: 1 });
            this._drawText(step.text, m(PAD + 0.25), top + m(0.006), {
                maxW: m(INNER - 0.25), maxLines: 2, lineH: 1.2,
            });
        });
    }

    _renderLearn(i) {
        const card = LEARN[i];
        let y = this._drawTitle(card.title, `Step ${i + 1} of ${LEARN.length}`);
        if (card.big) {
            this._drawText(card.big, m(PAD), y, { size: SIZE.title, weight: 700, color: COLOR.accent, maxLines: 1 });
            y += m(0.065);
        }
        this._drawText(card.body, m(PAD), y, { maxLines: 3 });
    }

    _renderControls() {
        let right = null;
        if (this.screen === 'quiz' && this._challenge?.isExamMode) {
            const { current, total } = this._challenge.questionProgress;
            right = `Question ${current} of ${total}`;
        }
        this._drawTitle(this.screen === 'quiz' ? 'Quiz' : 'Explore', right);

        const y = m(0.43);
        if (this._status) {
            this._drawText(this._status.text, m(PAD), y, { color: this._status.color, maxLines: 2, lineH: 1.15 });
        } else if (this._launchEnabled) {
            this._drawText('Set thrust and mass, then press Launch.', m(PAD), y, { color: COLOR.textMuted, maxLines: 1 });
        }
    }
}

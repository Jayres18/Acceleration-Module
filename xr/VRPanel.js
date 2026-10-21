import * as THREE from 'three';
import { COLOR, SIZE, PX_PER_M, font } from '../ui/tokens.js';

/** Metres → canvas pixels. Every layout in the panels is written in metres. */
export const m = metres => Math.round(metres * PX_PER_M);

// Base class: a 3D floating panel backed by a canvas texture.
// Subclasses define their layout, draw to ctx, and register
// interactive elements (buttons / sliders) in canvas-pixel coords.
//
// Look and behaviour follow the shared UI spec (ui/tokens.js): opaque panels,
// buttons that fire on release, hover / pressed / disabled states, and the same
// Back · Menu · Reset · Exit bar along the bottom of every main-panel screen.
export class VRPanel {
    /** Every live panel, so they can all be redrawn once the Inter webfont arrives. */
    static all = new Set();

    constructor(worldW, worldH) {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');

        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.anisotropy = 4;

        // Opaque (B25): the old panels were 93%-alpha with depthWrite off, so the
        // flight data showed through the How to Use text. alphaTest keeps the
        // rounded corners cut out while the panel itself writes depth and hides
        // whatever is behind it. toneMapped off so the token colours arrive on
        // screen as specified, not run through the scene's ACES curve.
        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
                map: this.texture,
                alphaTest: 0.5,
                side: THREE.FrontSide,
                toneMapped: false,
            })
        );
        this.mesh.userData.vrPanel = this;

        // Pivot at the panel's top edge, so a panel that grows (results, an exam's
        // targets) extends downward instead of rising above eye level.
        this.object = new THREE.Group();
        this.object.add(this.mesh);

        this.elements = [];
        this.hoveredEl = null;
        this.pressedEl = null;
        this.activeSlider = null;

        this.resize(worldW, worldH);
        VRPanel.all.add(this);
    }

    /** Change the panel's world size; the canvas follows at PX_PER_M. */
    resize(worldW, worldH) {
        this.worldW = worldW;
        this.worldH = worldH;
        this.canvasW = this.canvas.width = m(worldW);
        this.canvasH = this.canvas.height = m(worldH);
        this.mesh.scale.set(worldW, worldH, 1);
        this.mesh.position.y = -worldH / 2;
        // A resized canvas needs a fresh GPU texture, not just an upload.
        this.texture.dispose();
    }

    get visible() { return this.object.visible; }
    set visible(v) { this.object.visible = v; }

    // ── Element registration ───────────────────────────────────────────

    /**
     * @param {object} style  { variant: 'primary'|'secondary'|'danger', icon }
     */
    addButton(id, label, x, y, w, h, callback, style = {}) {
        this.elements.push({ id, type: 'button', label, x, y, w, h, callback, style, disabled: false });
        return this;
    }

    addSlider(id, label, x, y, w, h, min, max, value, callback, format = null) {
        this.elements.push({ id, type: 'slider', label, x, y, w, h, min, max, value, callback, format });
        return this;
    }

    clearElements() {
        this.elements = [];
        this.hoveredEl = null;
        this.pressedEl = null;
        this.activeSlider = null;
    }

    getElement(id) {
        return this.elements.find(e => e.id === id) ?? null;
    }

    setDisabled(id, disabled) {
        const el = this.getElement(id);
        if (el) el.disabled = disabled;
    }

    // ── Hit detection (canvas pixel coords) ───────────────────────────

    // uv: THREE intersection UV — (0,0) bottom-left, (1,1) top-right
    _uvToCanvas(uv) {
        return { px: uv.x * this.canvasW, py: (1 - uv.y) * this.canvasH };
    }

    getElementAt(uv) {
        const { px, py } = this._uvToCanvas(uv);
        return this.elements.find(el =>
            !el.disabled &&
            px >= el.x && px <= el.x + el.w &&
            py >= el.y && py <= el.y + el.h
        ) || null;
    }

    // ── Interaction events (called by XRHandler) ───────────────────────

    /** @returns {boolean} true when the ray has just moved onto an element. */
    onHover(uv) {
        const el = this.getElementAt(uv);
        if (this.hoveredEl === el) return false;
        this.hoveredEl = el;
        this.render();
        return el !== null;
    }

    onHoverEnd() {
        if (this.hoveredEl !== null) {
            this.hoveredEl = null;
            this.render();
        }
    }

    /**
     * Buttons are only *pressed* here; they fire on release (onSelectEnd), and
     * only if the ray is still on the same button. Sliders start dragging at
     * once.
     *
     * @returns {'button'|'slider'|null} what was pressed
     */
    onSelectStart(uv) {
        const el = this.getElementAt(uv);
        if (!el) return null;
        if (el.type === 'button') {
            this.pressedEl = el;
            this.render();
            return 'button';
        }
        this.activeSlider = el;
        this._applySlider(el, uv);
        return 'slider';
    }

    onSelectMove(uv) {
        if (this.activeSlider) this._applySlider(this.activeSlider, uv);
    }

    /**
     * @param {THREE.Vector2|null} uv  where the ray is now on this panel, or
     *                                 null if it has left the panel
     */
    onSelectEnd(uv) {
        const pressed = this.pressedEl;
        this.pressedEl = null;
        this.activeSlider = null;
        if (pressed && uv && this.getElementAt(uv) === pressed) {
            pressed.callback();
        }
        this.render();
    }

    _applySlider(slider, uv) {
        const { px } = this._uvToCanvas(uv);
        const t = Math.max(0, Math.min(1, (px - slider.x) / slider.w));
        const newVal = slider.min + t * (slider.max - slider.min);
        if (Math.abs(newVal - slider.value) > 0.001) {
            slider.value = newVal;
            slider.callback(slider.value);
            this.render();
        }
    }

    // ── Base render (subclasses must call super.render() at the end) ───

    render() {
        this.texture.needsUpdate = true;
    }

    // ── Shared drawing primitives ──────────────────────────────────────

    _drawBackground() {
        const { ctx, canvasW, canvasH } = this;
        const r = m(SIZE.radius);
        const b = Math.max(2, m(SIZE.border));
        ctx.clearRect(0, 0, canvasW, canvasH);
        ctx.fillStyle = COLOR.panelBg;
        this._rr(0, 0, canvasW, canvasH, r);
        ctx.fill();
        ctx.strokeStyle = COLOR.panelBorder;
        ctx.lineWidth = b;
        this._rr(b / 2, b / 2, canvasW - b, canvasH - b, r - b / 2);
        ctx.stroke();
    }

    /** Panel title, top-left. Returns the y (px) just below it. */
    _drawTitle(text, right = null) {
        const { ctx, canvasW } = this;
        const x = m(SIZE.pad);
        const top = m(SIZE.pad);
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = COLOR.textPrimary;
        ctx.font = font(700, m(SIZE.title));
        ctx.fillText(text, x, top);
        if (right) {
            ctx.textAlign = 'right';
            ctx.fillStyle = COLOR.textMuted;
            ctx.font = font(600, m(SIZE.body));
            ctx.fillText(right, canvasW - x, top + m(SIZE.title - SIZE.body) / 2);
        }
        ctx.textBaseline = 'alphabetic';
        return top + m(SIZE.title) + m(0.015);
    }

    /**
     * Wrapped text. Returns the height drawn, in px.
     * @param {object} o  { size (m), weight, color, align, maxW (px), maxLines, lineH (× size) }
     */
    _drawText(text, x, y, o = {}) {
        const { ctx } = this;
        const size = m(o.size ?? SIZE.body);
        const lineH = Math.round(size * (o.lineH ?? 1.3));
        ctx.font = font(o.weight ?? 400, size);
        ctx.fillStyle = o.color ?? COLOR.textSecondary;
        ctx.textAlign = o.align ?? 'left';
        ctx.textBaseline = 'top';

        const lines = this._wrap(String(text ?? ''), o.maxW ?? (this.canvasW - x - m(SIZE.pad)), o.maxLines ?? 3);
        lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineH));
        ctx.textBaseline = 'alphabetic';
        return lines.length * lineH;
    }

    _wrap(text, maxW, maxLines) {
        const { ctx } = this;
        const words = text.split(/\s+/).filter(Boolean);
        const lines = [];
        let line = '';
        for (const word of words) {
            const next = line ? `${line} ${word}` : word;
            if (ctx.measureText(next).width <= maxW || !line) {
                line = next;
            } else {
                lines.push(line);
                line = word;
            }
        }
        if (line) lines.push(line);
        if (lines.length <= maxLines) return lines;

        const kept = lines.slice(0, maxLines);
        let last = kept[maxLines - 1];
        while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
        kept[maxLines - 1] = `${last}…`;
        return kept;
    }

    _drawButton(el) {
        const { ctx } = this;
        const variant  = el.style.variant ?? 'secondary';
        const hov      = this.hoveredEl === el && !el.disabled;
        const pressed  = this.pressedEl === el && !el.disabled;

        // Hover: +5% scale and a 2 px accent outline (spec §4).
        const s = hov && !pressed ? 1.05 : 1;
        const w = el.w * s, h = el.h * s;
        const x = el.x - (w - el.w) / 2, y = el.y - (h - el.h) / 2;
        const r = Math.min(m(0.012), h / 2);

        let fill, text;
        if (el.disabled) {
            fill = COLOR.disabledBg; text = COLOR.disabledText;
        } else if (pressed) {
            fill = COLOR.accentPressed; text = COLOR.textOnAccent;
        } else if (variant === 'primary') {
            fill = hov ? COLOR.accentHover : COLOR.accent; text = COLOR.textOnAccent;
        } else if (variant === 'danger') {
            fill = COLOR.danger; text = COLOR.textOnDanger;
        } else {
            fill = COLOR.surface; text = COLOR.textPrimary;
        }

        ctx.fillStyle = fill;
        this._rr(x, y, w, h, r);
        ctx.fill();

        if (hov) {
            ctx.strokeStyle = COLOR.accent;
            ctx.lineWidth = 2;
            this._rr(x + 1, y + 1, w - 2, h - 2, r);
            ctx.stroke();
        } else if (!el.disabled && variant === 'secondary') {
            ctx.strokeStyle = COLOR.panelBorder;
            ctx.lineWidth = 2;
            this._rr(x + 1, y + 1, w - 2, h - 2, r);
            ctx.stroke();
        }

        const size = m(SIZE.button) * s;
        ctx.font = font(600, size);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const labelW = ctx.measureText(el.label).width;
        const iconW = el.style.icon ? size * 0.9 : 0;
        const iconGap = el.style.icon && el.label ? size * 0.35 : 0;
        let cx = x + (w - (iconW + iconGap + labelW)) / 2;
        const cy = y + h / 2;

        if (el.style.icon) {
            this._drawIcon(el.style.icon, cx + iconW / 2, cy, iconW, text);
            cx += iconW + iconGap;
        }
        ctx.fillStyle = text;
        ctx.fillText(el.label, cx, cy + 1);
        ctx.textBaseline = 'alphabetic';
    }

    _drawSlider(el) {
        const { ctx } = this;
        const active = this.hoveredEl === el || this.activeSlider === el;
        const trackH = m(0.014);
        const trackY = el.y + el.h - trackH - m(0.014);
        const t = (el.value - el.min) / (el.max - el.min);
        const valStr = el.format
            ? el.format(el.value)
            : (el.max - el.min) <= 10 ? el.value.toFixed(1) : Math.round(el.value).toString();

        ctx.textBaseline = 'top';
        ctx.font = font(600, m(SIZE.body));
        ctx.textAlign = 'left';
        ctx.fillStyle = COLOR.textSecondary;
        ctx.fillText(el.label, el.x, el.y);
        ctx.textAlign = 'right';
        ctx.fillStyle = COLOR.textPrimary;
        ctx.font = font(700, m(SIZE.body));
        ctx.fillText(valStr, el.x + el.w, el.y);
        ctx.textBaseline = 'alphabetic';

        // Track
        ctx.fillStyle = COLOR.surface;
        this._rr(el.x, trackY, el.w, trackH, trackH / 2);
        ctx.fill();

        // Fill
        if (t > 0.005) {
            ctx.fillStyle = active ? COLOR.accentHover : COLOR.accent;
            this._rr(el.x, trackY, Math.max(trackH, el.w * t), trackH, trackH / 2);
            ctx.fill();
        }

        // Thumb
        const tx = el.x + el.w * t;
        const tr = trackH * (active ? 1.25 : 1.1);
        ctx.fillStyle = COLOR.textPrimary;
        ctx.beginPath();
        ctx.arc(tx, trackY + trackH / 2, tr, 0, Math.PI * 2);
        ctx.fill();
        if (active) {
            ctx.strokeStyle = COLOR.accent;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    // ── Navigation bar (spec §7) ───────────────────────────────────────

    /**
     * Back · Menu · Reset along the bottom edge, Exit at the far right in the
     * danger colour. Identical on every main-panel screen and in the wrist menu.
     *
     * @param {{back, menu, reset, exit}} nav  handlers, from XRHandler
     * @param {{back?: boolean, menu?: boolean, reset?: boolean}} enabled
     */
    _addNavBar(nav, enabled = {}) {
        const pad = m(SIZE.pad);
        const h = m(SIZE.buttonH);
        const w = m(0.15);
        const gap = m(SIZE.gap);
        const y = this.canvasH - pad - h;

        this.addButton('nav-back',  'Back',  pad,                 y, w, h, nav.back,  { icon: 'back' });
        this.addButton('nav-menu',  'Menu',  pad + (w + gap),     y, w, h, nav.menu,  { icon: 'menu' });
        this.addButton('nav-reset', 'Reset', pad + (w + gap) * 2, y, w, h, nav.reset, { icon: 'reset' });
        this.addButton('nav-exit',  'Exit',  this.canvasW - pad - w, y, w, h, nav.exit, { icon: 'exit', variant: 'danger' });

        this.setDisabled('nav-back',  enabled.back  === false);
        this.setDisabled('nav-menu',  enabled.menu  === false);
        this.setDisabled('nav-reset', enabled.reset === false);
        return y;
    }

    /** Height a nav bar takes from the bottom of the panel, in metres. */
    static get NAV_H() { return SIZE.buttonH + SIZE.pad; }

    // ── Icons ──────────────────────────────────────────────────────────
    //
    // Drawn, not typed: ◀ ⌂ ⟲ ✕ are not in the vendored Inter subset, and the
    // headset's fallback font is not something this module controls.

    _drawIcon(name, cx, cy, size, color) {
        const { ctx } = this;
        const s = size / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = Math.max(2, size * 0.12);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch (name) {
        case 'back':
            ctx.beginPath();
            ctx.moveTo(s * 0.5, -s * 0.7);
            ctx.lineTo(-s * 0.6, 0);
            ctx.lineTo(s * 0.5, s * 0.7);
            ctx.closePath();
            ctx.fill();
            break;
        case 'menu':
            ctx.beginPath();
            ctx.moveTo(-s * 0.8, -s * 0.05);
            ctx.lineTo(0, -s * 0.8);
            ctx.lineTo(s * 0.8, -s * 0.05);
            ctx.moveTo(-s * 0.55, -s * 0.25);
            ctx.lineTo(-s * 0.55, s * 0.75);
            ctx.lineTo(s * 0.55, s * 0.75);
            ctx.lineTo(s * 0.55, -s * 0.25);
            ctx.stroke();
            break;
        case 'reset':
            ctx.beginPath();
            ctx.arc(0, 0, s * 0.65, -Math.PI * 0.35, Math.PI * 1.4);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(s * 0.62, -s * 0.95);
            ctx.lineTo(s * 0.5, -s * 0.38);
            ctx.lineTo(s * 0.02, -s * 0.62);
            ctx.stroke();
            break;
        case 'exit':
            ctx.beginPath();
            ctx.moveTo(-s * 0.55, -s * 0.55);
            ctx.lineTo(s * 0.55, s * 0.55);
            ctx.moveTo(s * 0.55, -s * 0.55);
            ctx.lineTo(-s * 0.55, s * 0.55);
            ctx.stroke();
            break;
        case 'hand':
            // palm + four fingers + thumb
            ctx.beginPath();
            this._rr(-s * 0.5, -s * 0.05, s * 1.0, s * 0.95, s * 0.3);
            ctx.fill();
            for (let i = 0; i < 4; i++) {
                const fx = -s * 0.38 + i * s * 0.25;
                ctx.beginPath();
                ctx.moveTo(fx, 0);
                ctx.lineTo(fx, -s * (i === 1 || i === 2 ? 0.9 : 0.75));
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(-s * 0.45, s * 0.35);
            ctx.lineTo(-s * 0.85, -s * 0.15);
            ctx.stroke();
            break;
        case 'controller':
            // grip body + ring + trigger
            ctx.beginPath();
            ctx.arc(0, -s * 0.35, s * 0.45, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            this._rr(-s * 0.22, -s * 0.1, s * 0.44, s * 1.0, s * 0.18);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(s * 0.22, s * 0.1);
            ctx.lineTo(s * 0.45, s * 0.3);
            ctx.stroke();
            break;
        }
        ctx.restore();
    }

    // Rounded rect path helper
    _rr(x, y, w, h, r) {
        const { ctx } = this;
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }
}

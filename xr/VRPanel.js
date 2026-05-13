import * as THREE from 'three';

// Base class: a 3D floating panel backed by a canvas texture.
// Subclasses define their layout, draw to ctx, and register
// interactive elements (buttons / sliders) in canvas-pixel coords.
export class VRPanel {
    constructor(worldW, worldH, canvasW, canvasH) {
        this.worldW = worldW;
        this.worldH = worldH;
        this.canvasW = canvasW;
        this.canvasH = canvasH;

        this.canvas = document.createElement('canvas');
        this.canvas.width = canvasW;
        this.canvas.height = canvasH;
        this.ctx = this.canvas.getContext('2d');

        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;

        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(worldW, worldH),
            new THREE.MeshBasicMaterial({
                map: this.texture,
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false,
            })
        );
        this.mesh.userData.vrPanel = this;

        this.elements = [];
        this.hoveredEl = null;
        this.activeSlider = null;
    }

    // ── Element registration ───────────────────────────────────────────

    addButton(id, label, x, y, w, h, callback, style = {}) {
        this.elements.push({ id, type: 'button', label, x, y, w, h, callback, style, disabled: false });
        return this;
    }

    addSlider(id, label, x, y, w, h, min, max, value, callback) {
        this.elements.push({ id, type: 'slider', label, x, y, w, h, min, max, value, callback });
        return this;
    }

    setDisabled(id, disabled) {
        const el = this.elements.find(e => e.id === id);
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

    onHover(uv) {
        const el = this.getElementAt(uv);
        if (this.hoveredEl !== el) {
            this.hoveredEl = el;
            this.render();
        }
    }

    onHoverEnd() {
        if (this.hoveredEl !== null) {
            this.hoveredEl = null;
            this.render();
        }
    }

    onSelectStart(uv) {
        const el = this.getElementAt(uv);
        if (!el) return;
        if (el.type === 'button') {
            el.callback();
            this.render();
        } else if (el.type === 'slider') {
            this.activeSlider = el;
            this._applySlider(el, uv);
        }
    }

    onSelectMove(uv) {
        if (this.activeSlider) this._applySlider(this.activeSlider, uv);
    }

    onSelectEnd() {
        this.activeSlider = null;
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
        ctx.clearRect(0, 0, canvasW, canvasH);
        // Panel fill
        ctx.fillStyle = 'rgba(4, 8, 30, 0.93)';
        this._rr(0, 0, canvasW, canvasH, 20);
        ctx.fill();
        // Border
        const grad = ctx.createLinearGradient(0, 0, canvasW, canvasH);
        grad.addColorStop(0, '#2255ee');
        grad.addColorStop(1, '#112299');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5;
        this._rr(1.5, 1.5, canvasW - 3, canvasH - 3, 19);
        ctx.stroke();
    }

    _drawTitle(text) {
        const { ctx, canvasW } = this;
        ctx.fillStyle = '#4499ff';
        ctx.font = 'bold 26px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(text, canvasW / 2, 38);
        // Underline
        ctx.strokeStyle = '#223388';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(20, 46);
        ctx.lineTo(canvasW - 20, 46);
        ctx.stroke();
    }

    _drawButton(el) {
        const { ctx } = this;
        const hov = this.hoveredEl === el;
        if (el.disabled) {
            ctx.fillStyle = '#1a1a2e';
        } else if (el.style.secondary) {
            ctx.fillStyle = hov ? '#555566' : '#333344';
        } else {
            ctx.fillStyle = hov ? '#2277ff' : '#1144cc';
        }
        this._rr(el.x, el.y, el.w, el.h, 9);
        ctx.fill();
        ctx.strokeStyle = el.disabled ? '#333355' : (hov ? '#55aaff' : '#2244aa');
        ctx.lineWidth = 1.5;
        this._rr(el.x, el.y, el.w, el.h, 9);
        ctx.stroke();

        ctx.fillStyle = el.disabled ? '#555577' : '#ffffff';
        ctx.font = `bold ${Math.floor(el.h * 0.42)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(el.label, el.x + el.w / 2, el.y + el.h / 2);
        ctx.textBaseline = 'alphabetic';
    }

    _drawSlider(el) {
        const { ctx } = this;
        const hov = this.hoveredEl === el || this.activeSlider === el;
        const trackH = 16;
        const trackY = el.y + el.h - trackH - 6;
        const t = (el.value - el.min) / (el.max - el.min);
        const valStr = (el.max - el.min) <= 10
            ? el.value.toFixed(1)
            : Math.round(el.value).toString();

        // Label
        ctx.fillStyle = '#8899cc';
        ctx.font = '18px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(el.label, el.x, el.y + 22);

        // Value
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(valStr, el.x + el.w, el.y + 22);

        // Track bg
        ctx.fillStyle = '#080818';
        this._rr(el.x, trackY, el.w, trackH, trackH / 2);
        ctx.fill();
        ctx.strokeStyle = '#223';
        ctx.lineWidth = 1;
        this._rr(el.x, trackY, el.w, trackH, trackH / 2);
        ctx.stroke();

        // Track fill
        if (t > 0.005) {
            ctx.fillStyle = hov ? '#44bbff' : '#2266ee';
            const fw = Math.max(trackH, el.w * t);
            this._rr(el.x, trackY, fw, trackH, trackH / 2);
            ctx.fill();
        }

        // Thumb
        const tx = el.x + el.w * t;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(tx, trackY + trackH / 2, trackH * 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = hov ? '#66ccff' : '#aabbdd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tx, trackY + trackH / 2, trackH * 0.75, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Rounded rect path helper
    _rr(x, y, w, h, r) {
        const { ctx } = this;
        r = Math.min(r, w / 2, h / 2);
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

/**
 * TEMPORARY DIAGNOSTIC — delete with the ?xrdebug branch in main.js once the
 * Quest 3 black screen is settled.
 *
 * Loaded only for ?xrdebug=1, and deliberately external to the app: it wraps
 * nothing and changes no behaviour. An exception thrown inside a
 * requestAnimationFrame callback reaches window.onerror, so a throwing frame
 * loop is caught here without touching _animate.
 *
 * The overlay is appended to <body>, not to #ui-container, because the XR
 * session handler hides that container — the readout has to survive entering
 * and leaving VR so it can be read with the headset off.
 */

const MAX_ERRORS = 6;

export function installXRDiagnostics(renderer) {
    const errors = [];
    const note = (what) => {
        if (errors.length < MAX_ERRORS) errors.push(what);
    };

    addEventListener('error', e => note(
        `${e.message}\n      at ${e.filename}:${e.lineno}:${e.colno}` +
        (e.error?.stack ? `\n      ${e.error.stack.split('\n').slice(1, 4).join('\n      ')}` : '')
    ));
    addEventListener('unhandledrejection', e => note(
        `unhandled rejection: ${e.reason?.message ?? e.reason}` +
        (e.reason?.stack ? `\n      ${e.reason.stack.split('\n').slice(1, 4).join('\n      ')}` : '')
    ));

    // Count actual draw calls rather than loop iterations: this is what proves
    // whether anything reached the headset's framebuffer.
    let renders = 0, xrRenders = 0;
    const realRender = renderer.render.bind(renderer);
    renderer.render = function (scene, camera) {
        renders++;
        if (renderer.xr.isPresenting) xrRenders++;
        return realRender(scene, camera);
    };

    renderer.xr.addEventListener('sessionstart', () => note('(info) sessionstart fired'));
    renderer.xr.addEventListener('sessionend',   () => note('(info) sessionend fired'));

    const box = document.createElement('div');
    box.style.cssText = `position:fixed; left:0; top:0; z-index:99999;
        padding:10px 14px; background:rgba(0,0,0,.88); color:#0f0;
        font:13px/1.45 monospace; white-space:pre; max-width:96vw;
        pointer-events:none;`;
    document.body.appendChild(box);

    const camPos = () => {
        try {
            const c = renderer.xr.getCamera();
            const p = c.getWorldPosition(new (c.position.constructor)());
            return `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;
        } catch { return 'n/a'; }
    };

    function paint() {
        const session = renderer.xr.getSession?.();
        const canvas = renderer.domElement;
        box.textContent = [
            `presenting   ${renderer.xr.isPresenting}`,
            `renders      total ${renders} | while presenting ${xrRenders}`,
            `canvas       ${canvas.width}x${canvas.height}   window ${innerWidth}x${innerHeight}`,
            `refspace     ${renderer.xr.getReferenceSpace() ? 'acquired' : 'NONE'}`,
            `blendmode    ${session?.environmentBlendMode ?? '—'}`,
            // three r184 has no getReferenceSpaceType, so read it off the
            // camera height instead: 'local' puts the origin at the head, so y
            // stays near 0, while 'local-floor' puts it on the floor and y is
            // the viewer's standing height. y around 1.2-1.8 in the headset
            // therefore means the fix is not live and the module is stale.
            `xr camera    ${camPos()}`,
            `             y near 0 = local (fix live) | y 1.2-1.8 = local-floor (stale)`,
            errors.length ? `events\n  - ${errors.join('\n  - ')}` : 'events       none',
        ].join('\n');
        requestAnimationFrame(paint);
    }
    paint();

    console.info('[xrdebug] diagnostics installed');
}

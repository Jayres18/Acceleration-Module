/**
 * Run with: node --test
 *
 * A source-level guard, like scenes/MainScene.test.js. WebXR cannot be driven
 * under node, and this failure mode is invisible anywhere but a headset.
 *
 * Everything XRHandler renders happens inside an XR frame, where three.js has
 * already bound the session's framebuffer. setRenderTarget(null) there does not
 * restore it — it selects the canvas, and the headset then receives no further
 * frames while the loop carries on running. The symptom is a frozen view with
 * working audio, which reads like a hang rather than a binding mistake.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

test('XR rendering restores the previous render target, never null', () => {
    const src = readFileSync(join(HERE, 'XRHandler.js'), 'utf8');

    const offending = src
        .split(/\r?\n/)
        .filter(line => !line.trim().startsWith('//'))
        .filter(line => /setRenderTarget\s*\(\s*null\s*\)/.test(line));

    assert.deepEqual(
        offending, [],
        'Inside an XR frame the session framebuffer is already bound, so '
        + 'setRenderTarget(null) redirects the rest of the frame to the canvas '
        + 'and the headset view freezes. Save getRenderTarget() and restore it.',
    );
});

test('the chase render opts out of XR camera substitution', () => {
    // WebGLRenderer.render() replaces the camera it is given with the headset's
    // while a session is presenting, so an off-screen pass that needs its own
    // camera has to turn xr.enabled off around the call. Without it the VR
    // monitor shows the viewer's own view instead of the chase view, cropped to
    // the XR viewport — which reads as a framing bug rather than the camera
    // substitution it actually is.
    const src = readFileSync(join(HERE, 'XRHandler.js'), 'utf8');
    const from = src.indexOf('renderCameraView(');
    const body = src.slice(from, src.indexOf('\n    }', from));

    assert.match(body, /xr\.enabled = false/,
        'renderCameraView must disable xr.enabled around its render');
    assert.match(body, /xr\.enabled = wasXrEnabled/,
        'and restore it afterwards, or the main XR render stops working');
});

/**
 * Run with: node --test
 *
 * A source-level guard, not a behavioural test. WebXR cannot be exercised
 * under node, and the bug this protects against is invisible everywhere except
 * on a headset: deleting window.XRWebGLBinding makes three.js fall back to
 * updateRenderState({ baseLayer }), which the spec forbids on a session that
 * was granted the 'layers' feature — as VRButton always requests and a Quest 3
 * always grants. The session then presents and never renders a single frame.
 *
 * It cost a long debugging session to find once. This makes reintroducing it
 * cost one failing test instead.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

test('the renderer never deletes XRWebGLBinding', () => {
    const src = readFileSync(join(HERE, 'MainScene.js'), 'utf8');

    // Match only real code: a commented explanation of why it must not be done
    // is exactly what should be there instead.
    const offending = src
        .split(/\r?\n/)
        .filter(line => !line.trim().startsWith('//'))
        .filter(line => /delete\s+(window\.)?XRWebGLBinding/.test(line));

    assert.deepEqual(
        offending, [],
        'Deleting XRWebGLBinding forces three.js onto the baseLayer path, which '
        + 'a Quest 3 rejects because VRButton requests the "layers" feature. '
        + 'The immersive session then renders nothing at all.',
    );
});

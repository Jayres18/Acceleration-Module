/**
 * Run with: node --test
 *
 * The in-headset Back / Menu buttons (bug B74). Pure state, so it runs under
 * node with no WebXR.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MenuNav } from './MenuNav.js';

test('starts on the start panel, with nowhere to go back to', () => {
    const nav = new MenuNav();
    assert.equal(nav.current, 'start');
    assert.equal(nav.canGoBack, false);
    assert.equal(nav.back(), false);
    assert.equal(nav.current, 'start');
});

test('Back retraces one step at a time', () => {
    const nav = new MenuNav();
    nav.go('learn-0');
    nav.go('learn-1');
    nav.go('learn-2');
    assert.equal(nav.back(), true);
    assert.equal(nav.current, 'learn-1');
    nav.back();
    nav.back();
    assert.equal(nav.current, 'start');
    assert.equal(nav.canGoBack, false);
});

test('Menu returns to the start panel from anywhere, and forgets the trail', () => {
    const nav = new MenuNav();
    nav.go('learn-0');
    nav.go('explore');
    nav.home();
    assert.equal(nav.current, 'start');
    assert.equal(nav.canGoBack, false);
});

test('going to the screen already shown does not stack a duplicate', () => {
    // A double pinch on Explore must not need two Backs to undo.
    const nav = new MenuNav();
    nav.go('explore');
    nav.go('explore');
    nav.back();
    assert.equal(nav.current, 'start');
});

test('replace swaps the current screen without growing the trail', () => {
    // Loading → How to Use: Back from How to Use must not land on Loading.
    const nav = new MenuNav('loading');
    nav.replace('start');
    nav.go('howto');
    nav.back();
    assert.equal(nav.current, 'start');
    assert.equal(nav.canGoBack, false);
});

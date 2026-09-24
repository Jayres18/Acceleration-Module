/**
 * Run with: node --test
 *
 * The trial quota is the one piece of trial logic with state, so it is the one
 * piece worth testing. Kept dependency-free with storage injected, exactly as
 * examLink.js is, so every path — including the failures — runs under Node.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LAUNCH_QUOTA, TRIAL_RANGES,
    launchesUsed, recordLaunch, launchesLeft, isExhausted,
} from './trialMode.js';

/** A minimal Storage stand-in. */
function memoryStore(initial = {}) {
    const data = { ...initial };
    return {
        getItem: k => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
    };
}

/** Storage that throws on every call, as a blocked or disabled one does. */
const hostileStore = {
    getItem() { throw new Error('storage disabled'); },
    setItem() { throw new Error('storage disabled'); },
};

test('a fresh visitor has the full quota', () => {
    const store = memoryStore();
    assert.equal(launchesUsed(store), 0);
    assert.equal(launchesLeft(store), LAUNCH_QUOTA);
    assert.equal(isExhausted(store), false);
});

test('each recorded launch spends one, and the count survives', () => {
    const store = memoryStore();

    for (let i = 1; i <= LAUNCH_QUOTA; i++) {
        recordLaunch(store);
        assert.equal(launchesUsed(store), i);
        assert.equal(launchesLeft(store), LAUNCH_QUOTA - i);
    }

    assert.equal(isExhausted(store), true);
});

test('the quota never goes negative, however many launches are recorded', () => {
    const store = memoryStore();
    for (let i = 0; i < LAUNCH_QUOTA + 5; i++) recordLaunch(store);

    assert.equal(launchesLeft(store), 0);
    assert.equal(isExhausted(store), true);
});

test('a junk or tampered value reads as a fresh quota rather than crashing', () => {
    // localStorage is a string store that anything can write to.
    for (const junk of ['', 'abc', '-3', '{}', 'NaN']) {
        const store = memoryStore({ 'acceleration:trial-launches': junk });
        assert.equal(launchesUsed(store), 0, `junk value ${JSON.stringify(junk)}`);
        assert.equal(isExhausted(store), false);
    }
});

test('disabled storage is not fatal — the trial stays usable', () => {
    // Storage can throw outright, not merely return null. A trial that crashes
    // in a locked-down browser is worse than one whose counter does not persist.
    assert.doesNotThrow(() => {
        assert.equal(launchesUsed(hostileStore), 0);
        recordLaunch(hostileStore);
        assert.equal(isExhausted(hostileStore), false);
    });
});

test('the trial slider ranges stay inside the full ranges and can still lift off', () => {
    const { thrust, mass } = TRIAL_RANGES;

    assert.ok(thrust.min >= 0 && thrust.max <= 200, 'thrust within the full 0-200 N');
    assert.ok(mass.min >= 1 && mass.max <= 50, 'mass within the full 1-50 kg');

    // The defaults the app boots with have to be selectable in the trial.
    assert.ok(thrust.min <= 150 && 150 <= thrust.max, '150 N default is reachable');
    assert.ok(mass.min <= 10 && 10 <= mass.max, '10 kg default is reachable');

    // At least one combination must beat gravity, or the trial cannot fly.
    assert.ok(thrust.max > mass.min * 9.81, 'some setting lifts off');
    // And one must fail, or the "not enough thrust" lesson is unreachable.
    assert.ok(thrust.min < mass.max * 9.81, 'some setting cannot lift');
});

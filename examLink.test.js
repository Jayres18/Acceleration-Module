/**
 * Run with: node --test
 *
 * `loc`, `store` and `hist` are injected parameters, so every path here —
 * including the failures, which are the ones worth testing — runs with no
 * browser and no DOM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureExamLink, clearExamLink, isExploreVisit, portalReturnUrl } from './examLink.js';

const PATH = '/acceleration/';

/** A sessionStorage stand-in that records what was written to it. */
function fakeStore(initial = null) {
    let value = initial;
    return {
        getItem: () => value,
        setItem: (_k, v) => { value = v; },
        removeItem: () => { value = null; },
        get value() { return value; },
    };
}

/** A history stand-in that records the URL it was asked to swap in. */
function fakeHist() {
    const calls = [];
    return { replaceState: (_s, _t, url) => calls.push(url), calls };
}

const throwingStore = {
    getItem() { throw new Error('disabled'); },
    setItem() { throw new Error('disabled'); },
    removeItem() { throw new Error('disabled'); },
};

test('both ids: captured, stored, and stripped from the address bar', () => {
    const store = fakeStore();
    const hist  = fakeHist();

    const out = captureExamLink({
        loc: { search: '?user_id=6&exam_id=45', pathname: PATH, hash: '' },
        store,
        hist,
    });

    assert.equal(out, '?user_id=6&exam_id=45');
    assert.equal(store.value, '?user_id=6&exam_id=45');
    // The ids are gone from the URL the student is left looking at.
    assert.equal(hist.calls.length, 1);
    assert.equal(hist.calls[0], PATH);
});

test('other query params survive the strip; only the ids go', () => {
    const hist = fakeHist();

    captureExamLink({
        loc: { search: '?user_id=6&exam_id=45&debug=1', pathname: PATH, hash: '' },
        store: fakeStore(),
        hist,
    });

    // ?debug=1 has to survive — it is how a teacher diagnoses a live headset.
    assert.equal(hist.calls[0], `${PATH}?debug=1`);
});

test('only one id is not a sitting', () => {
    const store = fakeStore();
    const hist  = fakeHist();

    const out = captureExamLink({
        loc: { search: '?user_id=6', pathname: PATH, hash: '' },
        store,
        hist,
    });

    assert.equal(out, '?user_id=6');   // falls through, parses to no exam_id
    assert.equal(store.value, null);   // nothing stored
    assert.equal(hist.calls.length, 0); // URL untouched
});

test('reload with nothing in the URL resumes the stored sitting', () => {
    const out = captureExamLink({
        loc: { search: '', pathname: PATH, hash: '' },
        store: fakeStore('?user_id=6&exam_id=45'),
        hist: fakeHist(),
    });

    assert.equal(out, '?user_id=6&exam_id=45');
});

test('explore beats the ids, and clears the stored sitting', () => {
    const store = fakeStore('?user_id=6&exam_id=45');

    const out = captureExamLink({
        loc: { search: '?mode=explore&user_id=6&exam_id=45', pathname: PATH, hash: '' },
        store,
        hist: fakeHist(),
    });

    // Grades nobody rather than grading the wrong person.
    assert.equal(out, '');
    // And the backed-out sitting is not handed back on the next Explore visit.
    assert.equal(store.value, null);
});

test('explore is still explore after the capture', () => {
    const loc = { search: '?mode=explore', pathname: PATH, hash: '' };
    captureExamLink({ loc, store: fakeStore(), hist: fakeHist() });
    assert.equal(isExploreVisit({ loc }), true);
});

test('storage throwing outright is not fatal', () => {
    let out;
    assert.doesNotThrow(() => {
        out = captureExamLink({
            loc: { search: '?user_id=6&exam_id=45', pathname: PATH, hash: '' },
            store: throwingStore,
            hist: fakeHist(),
        });
    });
    // The sitting still works; only surviving a reload is lost.
    assert.equal(out, '?user_id=6&exam_id=45');
});

test('storage throwing on an explore visit is not fatal', () => {
    let out;
    assert.doesNotThrow(() => {
        out = captureExamLink({
            loc: { search: '?mode=explore', pathname: PATH, hash: '' },
            store: throwingStore,
            hist: fakeHist(),
        });
    });
    assert.equal(out, '');
});

test('replaceState throwing is not fatal', () => {
    let out;
    assert.doesNotThrow(() => {
        out = captureExamLink({
            loc: { search: '?user_id=6&exam_id=45', pathname: PATH, hash: '' },
            store: fakeStore(),
            hist: { replaceState() { throw new Error('file:// origin'); } },
        });
    });
    assert.equal(out, '?user_id=6&exam_id=45');
});

test('clearExamLink forgets the sitting, and survives disabled storage', () => {
    const store = fakeStore('?user_id=6&exam_id=45');
    clearExamLink({ store });
    assert.equal(store.value, null);

    assert.doesNotThrow(() => clearExamLink({ store: throwingStore }));
});

// ── portalReturnUrl ─────────────────────────────────────────────────────

const ORIGIN = 'https://parallaxed.local';

test('Exit returns to the same-origin portal page that opened the module', () => {
    const url = portalReturnUrl({
        referrer: `${ORIGIN}/student-portal-explore?tab=physics`,
        origin: ORIGIN,
        modulePath: PATH,
        isExam: false,
    });
    assert.equal(url, `${ORIGIN}/student-portal-explore?tab=physics`);
});

test('a cross-origin referrer is never followed', () => {
    assert.equal(
        portalReturnUrl({ referrer: 'https://evil.example/', origin: ORIGIN, modulePath: PATH, isExam: false }),
        '/student-portal-explore',
    );
    assert.equal(
        portalReturnUrl({ referrer: 'https://evil.example/', origin: ORIGIN, modulePath: PATH, isExam: true }),
        '/student-portal-exam',
    );
});

test('no referrer falls back by sitting type', () => {
    assert.equal(portalReturnUrl({ referrer: '', origin: ORIGIN, modulePath: PATH, isExam: false }), '/student-portal-explore');
    assert.equal(portalReturnUrl({ referrer: '', origin: ORIGIN, modulePath: PATH, isExam: true }), '/student-portal-exam');
});

test('the module itself is not a place to return to', () => {
    // A reload inside the module can leave the module as its own referrer;
    // "returning" there would only restart the simulation.
    assert.equal(
        portalReturnUrl({ referrer: `${ORIGIN}${PATH}?mode=explore`, origin: ORIGIN, modulePath: PATH, isExam: false }),
        '/student-portal-explore',
    );
});

test('a malformed referrer is ignored rather than thrown on', () => {
    assert.equal(
        portalReturnUrl({ referrer: 'not a url', origin: ORIGIN, modulePath: PATH, isExam: false }),
        '/student-portal-explore',
    );
});

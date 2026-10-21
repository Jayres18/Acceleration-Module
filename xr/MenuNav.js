/**
 * The trail behind the in-headset Back and Menu buttons.
 *
 * Every screen of the main panel is a string id. `go` steps forward, `back`
 * retraces one step, `home` is the Menu button. Kept free of three.js and the
 * DOM so it can be tested under node.
 */
export class MenuNav {
    constructor(start = 'start') {
        this._root  = 'start';
        this._trail = [start];
    }

    get current()   { return this._trail[this._trail.length - 1]; }
    get canGoBack() { return this._trail.length > 1; }

    go(screen) {
        if (screen !== this.current) this._trail.push(screen);
    }

    /** Swap the current screen in place — Back will not return to it. */
    replace(screen) {
        this._trail[this._trail.length - 1] = screen;
    }

    /** @returns {boolean} false at the root, where there is nothing to go back to. */
    back() {
        if (!this.canGoBack) return false;
        this._trail.pop();
        return true;
    }

    home() {
        this._trail = [this._root];
    }
}

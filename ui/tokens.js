// ui/tokens.js
/**
 * ParallaxED shared UI spec — the design tokens every module uses, so the
 * menus look and sit the same from one module to the next (bug B69).
 *
 * The values are the spec's, verbatim. Change them there first, not here.
 */

export const COLOR = {
    panelBg:       '#1C1917',   // opaque, never see-through
    panelBorder:   '#3A3431',
    surface:       '#292524',   // cards inside panels, secondary buttons
    textPrimary:   '#FAFAF9',
    textSecondary: '#D6D3D1',
    textMuted:     '#A8A29E',
    accent:        '#F97316',   // primary action only: Start, Launch, Submit
    accentHover:   '#FB923C',
    accentPressed: '#EA580C',
    textOnAccent:  '#1C1917',
    danger:        '#DC2626',   // Exit
    textOnDanger:  '#FFFFFF',
    success:       '#22C55E',
    error:         '#EF4444',
    info:          '#38BDF8',
    disabledBg:    'rgba(41, 37, 36, 0.5)',
    disabledText:  '#78716C',
};

export const FONT_FAMILY = 'Inter, system-ui, sans-serif';

/** A canvas font string. `px` is the size in canvas pixels. */
export const font = (weight, px) => `${weight} ${Math.round(px)}px ${FONT_FAMILY}`;

// ── Sizes, in metres ──────────────────────────────────────────────────────

/** Canvas resolution of every VR panel. The spec's floor is 1000. */
export const PX_PER_M = 1200;

export const SIZE = {
    radius:  0.02,    // panel corner radius
    pad:     0.03,    // inner padding
    gap:     0.015,   // between buttons
    border:  2 / 1000,
    title:   0.045,
    heading: 0.032,
    body:    0.026,
    bodyMin: 0.022,
    button:  0.030,   // button label
    buttonH: 0.06,
    buttonW: 0.12,    // minimum
};

// ── Placement ─────────────────────────────────────────────────────────────
//
// The spec gives heights above the floor (local-floor). This module runs in the
// 'local' reference space instead — origin at the eye — for the reasons given
// in XRHandler._initXRButton, so heights are converted against an assumed eye
// height. For a student of that height the two are identical; for anyone else
// 'local' keeps the panels at the same height *relative to their eyes*, which is
// what the spec's limits ("nothing above eye level") are really about.

export const EYE_HEIGHT = 1.6;

/** Spec height above the floor → y in the 'local' reference space. */
export const eyeY = floorY => floorY - EYE_HEIGHT;

export const DEG = Math.PI / 180;

export const LAYOUT = {
    /** Main panel: straight ahead. Its top edge is pinned, so taller screens grow downward. */
    main: { w: 0.9, h: 0.6, yaw: 0, distance: 1.2, centreY: 1.35, tilt: -10 * DEG },
    /** Flight Data, to the right. */
    right: { w: 0.6, yaw: 35 * DEG, distance: 1.2, centreY: 1.35, tilt: -10 * DEG },
    /** Rocket-cam monitor, to the left — low, so it never hides the rocket itself. */
    left: { w: 0.5, yaw: -35 * DEG, distance: 1.2, centreY: 1.05, tilt: -20 * DEG },
    /**
     * The launch pad. Not straight ahead: the main panel is there, and a panel
     * in front of the rocket is exactly what B43 reported. Between the main
     * panel's edge (±21°) and the left monitor; -33° rather than -30° keeps the
     * fins (about ±9° wide at this distance) clear of the main panel's edge.
     */
    pad: { yaw: -33 * DEG, distance: 3.2 },
};

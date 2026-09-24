# Acceleration Module — Trial

A limited, **standalone** copy of the Acceleration Module for evaluation. It is
an independent project: its own source, its own `package.json`, its own
`node_modules`. Nothing here is generated from the module next door, and
nothing here is built by the module's build.

## What is limited

| | full module | this trial |
|---|---|---|
| Launches | unlimited | **5**, then LAUNCH locks |
| Thrust | 0–200 N | **100–200 N** |
| Mass | 1–50 kg | **5–20 kg** |
| Exam mode | portal-backed, scored | **removed entirely** |
| Badge | none | TRIAL on screen and on the VR HUD |

VR is deliberately **not** limited — it is the part worth showing.

The quota lives in `localStorage` under `acceleration:trial-launches`. It is a
speed bump, not DRM: anyone with devtools can clear it. Enforcing it properly
would need a server, which a trial does not have. Do not spend effort hiding it.

## Uploading it

`site/` is the built, uploadable folder, and it is **committed** — so it can be
handed over and uploaded without anyone installing Node.

Upload the *contents* of `site/`. The base path is relative, so it works at a
server root or under any subpath, with one condition: **serve it with a trailing
slash**, so `index.html` is served for the directory. At `/trial` rather than
`/trial/`, every asset is looked up at the server root instead and the page dies
with "unexpected token '<'".

## Changing it

```bash
npm install
npm run dev      # HTTPS, all interfaces — WebXR needs a secure context
npm test
npm run build    # rewrites site/
```

**After any source change, rebuild and commit `site/`.** It is a real committed
folder, not a build artifact, so it does not update itself and will otherwise
ship yesterday's code.

Editable knobs live in `trialMode.js`: the quota, the slider ranges, and
`TRIAL_CTA` — whose wording and link are still placeholders.

See `SYNC.md` before porting anything from the main module.

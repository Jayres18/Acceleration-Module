import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { lanCert } from './dev/lanCert.js';

export default defineConfig(({ command, isPreview }) => {
    const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');

    // The portal proxies /api to the backend at the server root, so in
    // development we have to stand in for that proxy ourselves. LMS_ORIGIN is
    // server-side only — read by Node here, never baked into the bundle — so an
    // absolute http:// URL is safe in this one place. Point it at the backend
    // host: loopback only if the backend runs on this same machine, otherwise
    // http://parallaxed.local:5000 (preferred — it survives a DHCP change) or
    // the current LAN IP.
    //
    // Built inside the config function so `env` is in scope: this has to read
    // .env as well as the real environment. Outside it, only a shell variable
    // worked and LMS_ORIGIN in .env was silently ignored — which looks like
    // nothing at all while the fallback happens to be the right host, and turns
    // into "the quiz never loads" the moment it isn't.
    //
    // Origin only: the proxy does not rewrite the path and the backend expects
    // the /api prefix, so no trailing path and no trailing slash.
    const apiProxy = {
        '/api': {
            target: process.env.LMS_ORIGIN ?? env.LMS_ORIGIN ?? 'http://parallaxed.local:5000',
            changeOrigin: true,
            // This module's own source also lives in api/, so in development the
            // browser requests the ES module import of ./api/ExamService.js as the
            // URL /api/ExamService.js — which matches this rule and is forwarded to
            // the LMS, where it is a 404 (or a 502 while the backend is unreachable).
            // The import then fails, and the whole module graph with it: no scene,
            // no rocket, no XR button, just the static HUD markup from index.html.
            //
            // A reachable backend does not fix it — it answers with its own 404 and
            // the import fails just the same. And it is invisible in a build, where
            // ExamService.js is inlined into the bundle and no such request is ever
            // made, so it breaks only the dev server: the one place where a blank
            // scene is hardest to attribute to the proxy.
            //
            // The LMS serves JSON endpoints and never a script, so handing any
            // request for a JS module back to Vite is unambiguous.
            bypass: (req) => {
                const path = (req.url ?? '').split('?')[0];
                const isScript = path.endsWith('.js')
                    || path.endsWith('.mjs')
                    || path.endsWith('.cjs');
                return isScript ? req.url : undefined;
            },
        },
    };

    // Defaults to the deploy slug rather than '/' so a bare `npm run build`
    // still produces a deployable bundle — a root build would 404 every asset
    // under /acceleration/ and the failure is invisible until it is deployed.
    // The trailing slash is required: `base` is used as a string prefix, so
    // '/acceleration' would emit '/accelerationassets/...'.
    const basePath = process.env.BASE_PATH ?? env.BASE_PATH ?? '/acceleration/';

    // A wrong base produces a bundle that asks the web root for its own assets
    // and renders a blank page with "unexpected token '<'" — deployed only, and
    // with nothing wrong on the dev server. Vite merely warns, so fail here.
    //
    // Worth checking on Windows in particular: Git Bash rewrites a leading-slash
    // argument as a path, so `BASE_PATH=/acceleration/ npm run build` silently
    // becomes '/Program Files/Git/acceleration/'. Set it in .env, use PowerShell,
    // or prefix with MSYS_NO_PATHCONV=1 — or just omit it and take the default.
    if (!basePath.startsWith('/') || !basePath.endsWith('/')) {
        throw new Error(
            `BASE_PATH must start and end with '/', got '${basePath}'. ` +
            `It is used as a string prefix, so '/acceleration' would emit ` +
            `'/accelerationassets/...'.`,
        );
    }

    // Builds and `vite preview` only. The dev server stays at the root of its
    // port so that BASE_URL is '/' there and the asset() helper is a no-op;
    // `command` is 'serve' for preview too, hence the isPreview arm.
    const base = command === 'build' || isPreview ? basePath : '/';

    // A certificate naming this machine's LAN IP and mDNS name, so a headset
    // can reach the dev server over HTTPS — WebXR will not start without a
    // secure context, and basic-ssl's certificate cannot name a LAN address.
    // Falls back to basic-ssl when OpenSSL is unavailable: still fine on the
    // desktop, still a name mismatch on a headset.
    const cert = lanCert();
    const https = cert ?? true;

    return {
        base,
        plugins: cert ? [] : [basicSsl()],
        server: {
            https,
            host: true,
            proxy: apiProxy,
        },
        // Easy to forget, and its absence is why a correct build 404s on /api
        // under `vite preview` while the dev server works — which reads as a
        // broken build when only the preview server is unconfigured.
        preview: {
            https,
            host: true,
            proxy: apiProxy,
        },
    };
});

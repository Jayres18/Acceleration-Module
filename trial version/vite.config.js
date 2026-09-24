import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { lanCert } from './dev/lanCert.js';

// Standalone trial build. Much smaller than the module's config, because the
// two things that make that one complicated do not exist here: there is no
// portal to proxy /api to, and no fixed deploy slug to validate.
export default defineConfig(() => {
    // Relative, not absolute. The trial is uploaded to a server whose mount
    // point is not known here, so the same folder has to work at that server's
    // root or under any subpath.
    //
    // It resolves against the document URL, so the page must be served WITH a
    // trailing slash: at `/trial` rather than `/trial/`, every asset is looked
    // up at the server root instead and the page dies with
    // "unexpected token '<'".
    const base = './';

    // WebXR will not start outside a secure context, and a bare IP in the
    // address bar is matched only against an iPAddress SAN — so testing this on
    // a headset needs a certificate that names the LAN address. basic-ssl
    // cannot do that and is only the fallback when OpenSSL is missing.
    const cert = lanCert();
    const https = cert ?? true;

    return {
        base,
        // Not `dist`: the parent repository's .gitignore has a bare `dist/`,
        // which matches at any depth, so a folder by that name here would be
        // silently untracked — and a directory exclusion cannot be undone with
        // a negation. `site/` is committed, and is what gets uploaded.
        build: { outDir: 'site', emptyOutDir: true },
        plugins: cert ? [] : [basicSsl()],
        server:  { https, host: true },
        preview: { https, host: true },
    };
});

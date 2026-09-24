/**
 * lanCert — a dev-server certificate that names the address a headset types.
 *
 * WebXR only starts in a secure context, and `http://localhost` is secure by
 * browser exception — so a plain-HTTP module works on a laptop and gives a
 * headset no `navigator.xr` at all. The dev server therefore has to serve
 * HTTPS, with a certificate covering however the headset reaches it.
 *
 * `@vitejs/plugin-basic-ssl` is not enough: its certificate names `localhost`,
 * `lvh.me` and `127.0.0.1` and cannot be made to name a LAN IP or an mDNS
 * hostname, so a headset arriving at `https://<host>.local:5173` gets a name
 * mismatch — the one certificate error that trusting the certificate does not
 * clear.
 *
 * The load-bearing detail: **a bare IP in the address bar is matched only
 * against an `iPAddress` SAN, never a `DNS` one.** Most helpers map every name
 * they are given to a DNS SAN, which silently produces a certificate that does
 * not cover the IP it was asked to cover. Both forms are emitted below.
 *
 * Dev only. Production TLS is terminated by the deployment server with the
 * portal's own certificate — shipping a second one would add an interstitial
 * mid-exam.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR      = join(dirname(fileURLToPath(import.meta.url)), 'certs');
const KEY_PATH = join(DIR, 'lan-key.pem');
const CRT_PATH = join(DIR, 'lan-cert.pem');
const SAN_PATH = join(DIR, 'sans.txt');

/** Every IPv4/IPv6 address this machine is reachable on, minus internal ones. */
function lanAddresses() {
    const out = [];
    for (const iface of Object.values(networkInterfaces())) {
        for (const addr of iface ?? []) {
            if (!addr.internal && !out.includes(addr.address)) out.push(addr.address);
        }
    }
    return out;
}

/**
 * The SAN list, in OpenSSL's `subjectAltName` syntax.
 *
 * mDNS name included because it survives a DHCP change — the LAN IP is a lease,
 * so a certificate pinned only to today's address stops matching without
 * warning the first time the lease moves.
 */
function sanList() {
    const host = hostname().replace(/\.local$/i, '');
    const names = ['DNS:localhost', `DNS:${host}`, `DNS:${host}.local`];
    const ips   = ['IP:127.0.0.1', 'IP:::1', ...lanAddresses().map(a => `IP:${a}`)];
    return [...names, ...ips].join(',');
}

function generate(sans) {
    mkdirSync(DIR, { recursive: true });

    // -addext keeps the SANs on one command with no config file to keep in
    // sync. CN is cosmetic — browsers have ignored it in favour of SANs for
    // years, and a certificate without SANs is rejected outright.
    execFileSync('openssl', [
        'req', '-x509',
        '-newkey', 'rsa:2048',
        '-nodes',
        '-keyout', KEY_PATH,
        '-out', CRT_PATH,
        '-days', '825',
        '-subj', `/CN=${hostname()}`,
        '-addext', `subjectAltName=${sans}`,
        '-addext', 'basicConstraints=critical,CA:FALSE',
        '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment',
        '-addext', 'extendedKeyUsage=serverAuth',
    ], { stdio: 'pipe' });

    writeFileSync(SAN_PATH, sans);
}

/**
 * Key and certificate for Vite's `server.https` / `preview.https`.
 *
 * Regenerates whenever the address set changes, so a moved DHCP lease is picked
 * up on the next restart rather than becoming a name mismatch on a headset.
 *
 * @returns {{key: Buffer, cert: Buffer}|null} null when OpenSSL is unavailable,
 *   so the caller can fall back rather than failing to start.
 */
export function lanCert() {
    const sans = sanList();

    const current =
        existsSync(KEY_PATH) &&
        existsSync(CRT_PATH) &&
        existsSync(SAN_PATH) &&
        readFileSync(SAN_PATH, 'utf8').trim() === sans;

    if (!current) {
        try {
            generate(sans);
            console.log(`[lanCert] issued certificate for ${sans}`);
        } catch (err) {
            console.warn(
                '[lanCert] could not run OpenSSL, falling back to basic-ssl.',
                'A headset reaching this server by LAN name or IP will see a name',
                'mismatch, so §7 headset testing needs this fixed:',
                err.message,
            );
            return null;
        }
    }

    return { key: readFileSync(KEY_PATH), cert: readFileSync(CRT_PATH) };
}

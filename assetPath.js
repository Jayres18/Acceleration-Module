// assetPath.js
/**
 * Resolve a file in public/ against the path the site is deployed under.
 *
 * The bundler rewrites `import` statements and `src=` attributes, but never a
 * path built as a string at runtime — so anything loaded by GLTFLoader, the
 * Audio constructor, or a hand-model profile has to be prefixed by hand.
 *
 * BASE_URL is whatever `base` was at build time ('/' on the dev server), and it
 * always ends in a slash — hence the slashless argument.
 */
export const asset = (path) => `${import.meta.env.BASE_URL}${path}`;

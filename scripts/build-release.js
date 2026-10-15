/* NEON RIFT release build — obfuscates game.js into game.obf.js.
   The release payload:
     - has the debug handle stripped (placeholder baked to `false`)
     - gets identifier mangling, control-flow flattening, and string encoding
   Keeps object properties and DOM-visible names intact (the HUD touches those). */
const fs = require('fs');
const path = require('path');
const JSObfuscator = require('javascript-obfuscator');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8')
  .replace(/window\.__ALLOW_DBG__/g, 'false');

console.log(`[build] obfuscating game.js (${(src.length / 1024).toFixed(0)} KB of source)… this takes a while`);
const t0 = Date.now();
const out = JSObfuscator.obfuscate(src, {
  target: 'browser',
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  identifiersPrefix: '_g',
  renameGlobals: false,            // top-level module bindings stay readable internally; window.* surface untouched
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
  deadCodeInjection: false,
  stringEncoding: ['base64'],
  stringEncodingThreshold: 0.55,
  splitStrings: false,
  transformObjectKeys: false,      // dynamic property lookups (WEAPONS[name], state arrays) must survive
  numbersToExpressions: true,
  simplify: true,
  unicodeEscapeSequence: false,
  ignoreImports: true,             // ESM: leave `import * as THREE from './three.module.js'` alone
  sourceMap: false,
}).getObfuscatedCode();

fs.writeFileSync(path.join(ROOT, 'game.obf.js'), out);
console.log(`[build] game.obf.js written (${(out.length / 1024).toFixed(0)} KB) in ${((Date.now() - t0) / 1000).toFixed(1)}s — restart or just hit the server; it serves automatically`);

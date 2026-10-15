/* BEAT — shared integrity-heartbeat utils (browser: window.BEAT, node: require()).
   The ceremony:
     1. server sends a salt per connection and rotates a lobby nonce ~4s
     2. every real client echoes the nonce + a digest of its live core-function sources
     3. server kicks on: silent beats from gameplay reporters, stale nonce echo,
        or a digest that diverges from the lobby consensus (runtime patching shows up here)
   Debug/raw builds: the digest is reproducible from the game.js TEXT on disk, so test bots
   can take the same oath honestly. Release builds: the lobby consensus is the arbiter.     */
(function (root, factory){ const api = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BEAT = api; })(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // the core gameplay functions whose live source strings get hashed — picked so any
  // console patch of damage, movement, netcode, or scoring logic moves the digest
  const FN_NAMES = [
    'fireWeapon', 'tryReload', 'equipLadderTier', 'syncLadderWeapon', 'equipGunSlot', 'equipKnifeSlot',
    'tryKnifeSwing', 'knifeStrike', 'throwGrenade', 'explodeAt', 'damageEnemy', 'applyBurn',
    'respawnDMPlayer', 'dmDeath', 'updatePlayer', 'updateEnemies', 'setMap', 'shuffleLadder',
    'updateNet', 'applyNetState', 'connectNet', 'netSend', 'bindDown',
    'castWorld', 'hasLOS', 'resolvePenetration', 'updateAmmoHUD', 'updateWeaponVisibility',
    'currentKnifeDef', 'knifeGolden', 'knifeLocked', 'isKnifeFight', 'isTeammate', 'grantProgress',
    'updateScoreboardHUD', 'showBanner', 'addKillFeed', 'registerKill',
  ];

  function fnv1a(str){
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }

  const normWs = s => String(s).replace(/\s+/g, ' ').trim();

  // pull one classic function declaration out of source text
  // (paren-matched signature FIRST — destructured default params contain braces)
  function extractFn(src, name){
    const re = new RegExp('function\\s+' + name + '\\s*\\(');
    const m = re.exec(src);
    if (!m) return null;
    let pi = src.indexOf('(', m.index), pDepth = 0, sigEnd = -1;
    for (let j = pi; j < src.length; j++){
      if (src[j] === '(') pDepth++;
      else if (src[j] === ')'){ pDepth--; if (!pDepth){ sigEnd = j; break; } }
    }
    if (sigEnd < 0) return null;
    let i = src.indexOf('{', sigEnd), depth = 0;
    for (let j = i; j < src.length; j++){
      if (src[j] === '{') depth++;
      else if (src[j] === '}'){ depth--; if (!depth) return normWs(src.slice(m.index, j + 1)); }
    }
    return null;
  }

  // browser path: hash the LIVE function objects (works identically under obfuscation —
  // same bundle served to the whole lobby → same live sources → same digest)
  function digestRuntime(fns){
    const parts = fns.map(f => (typeof f === 'function' ? normWs(f.toString()) : '∅'));
    return fnv1a(parts.join('|'));
  }

  // test-bot path (debug builds): reconstruct the same digest from the served source text
  function digestFromText(srcText, names = FN_NAMES){
    const parts = names.map(n => extractFn(srcText, n) || '∅');
    return fnv1a(parts.join('|'));
  }

  // nonce echo contract: beat.n must equal fnv1a(lobbyNonce ^ salt) — proves a live loop
  function nonceEcho(nonce, salt){ return fnv1a(String((nonce >>> 0) ^ (salt >>> 0))); }

  return { FN_NAMES, fnv1a, normWs, extractFn, digestRuntime, digestFromText, nonceEcho };
});

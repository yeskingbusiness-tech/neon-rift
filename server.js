/* NEON RIFT: BLACKOUT — static file + LAN multiplayer server
   Usage: npm install && node server.js (then open http://<this-machine's-ip>:8000 on any LAN device) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;

/* ================= ANTI-CHEAT =================
   The protocol is client-reported (victims report deaths, shooters report hits),
   so the server polices what it can see: message floods, inhuman hit/kill
   cadence, teleporting position streams, and garbage payloads. One unambiguous
   violation and the player is OUT of the match, instantly (socket closes, lobby
   gets told who was booted and why). Thresholds are set far beyond human play so
   legit rounds never trip them; env overrides let the test suite run hot:
   AC_MSG_MAX / AC_HIT_MAX / AC_KILL_MAX / AC_TPORT                                    */
const ENVN = (k, d) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
const AC = {
  MSG_WIN:  1000, MSG_MAX:  ENVN('AC_MSG_MAX', 240),   // even slide-cancelling esports gods stay under 240 msgs/s
  HIT_WIN:  1000, HIT_MAX:  ENVN('AC_HIT_MAX', 28),    // fastest legit autos ~ 15 reports/s — bumped for infection knife spam
  KILL_WIN: 2500, KILL_MAX: ENVN('AC_KILL_MAX', 9),    // a spray + a splash can chain 4-5 legit; infection burst can hit 8
  TPORT:                ENVN('AC_TPORT', 22),          // metres between consecutive state packets — up from 15 for lag/lift
  MAX_IP_CONNS: 64,                                    // up from 8 — LAN parties share one external IP (NAT), need headroom
};
const ipConns = new Map();      // ip -> live connections on this box

// layer 2+: speed audit, integrity heartbeat,
//           recidivist probation, and a coherence auditor that runs even if rate rings are dodged
Object.assign(AC, {
  SPEED_WIN: 3000, SPEED_MAX: ENVN('AC_SPEED', 110),         // metres travelled in the window — raised for 1.28× zombie sprint + slide bursts
  BEAT_MS: 20000,                                            // gameplay reporter without a heartbeat this long → socket bot (was 13s)
  AUDIT_MS: ENVN('AC_AUDIT_MS', 5000),                       // coherence auditor cadence (test rigs may shrink)
  PROB_MS: ENVN('AC_PROB_MS', 300000),                       // a kick earns 5 minutes of probation — halved thresholds
  HAND_MS: ENVN('AC_HAND_MS', 4100),                         // heartbeat challenge rotation
  AFK_MS: process.env.AC_AFK_MS === '0' ? 0 : ENVN('AC_AFK_MS', 90000),   // in-round inactivity eviction — was 15s, now 90s to cover full Infection hold; 0=off
});
const BEAT = require('./shared/beat.js');
const probationList = new Map();      // ip -> probation end timestamp (set by every kick)

function acOver(rate, events, now, win){
  while (events.length && now - events[0] > win) events.shift();
  return events.length > rate;
}
function acCount(events, now, win){ let c = 0; for (let i = events.length - 1; i >= 0 && now - events[i] < win; i--) c++; return c; }
function pg(p, v){ return p.probation ? Math.max(2, Math.floor(v / 2)) : v; }   // probation halves every threshold
function acKick(p, reason){
  console.log(new Date().toISOString().slice(11,19), `[anticheat] BOOTED ${p.name} (${p.ip}) — ${reason}${p.probation ? ' [on probation]' : ''}`);
  if (p.ip) probationList.set(p.ip, Date.now() + AC.PROB_MS);   // recidivist trap: come back on probation
  try { send(p.ws, { t:'kick', reason:'ANTI-CHEAT — ' + reason }); p.ws.close(4003); } catch {}
  broadcast({ t:'ac', name:p.name, reason });
}
/* AFK eviction is a janitor, not a judge: no probation, its own close code, its own news line. */
function idleKick(p){
  console.log(new Date().toISOString().slice(11,19), `[afk] kicked ${p.name} (${p.ip}) — idle ${Math.round(AC.AFK_MS / 1000)}s during round ${roundNo}`);
  try { send(p.ws, { t:'kick', reason:'KICKED FOR INACTIVITY' }); p.ws.close(4004); } catch {}
  broadcast({ t:'ac', kind:'idle', name:p.name, reason:'stood around too long' });
}
const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon', '.json':'application/json',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  let file = path.normalize(path.join(ROOT, p));
  // release pipeline: unless you `NR_DEBUG=1 node server.js`, game.js is served obfuscated
  // (game.obf.js, built by `npm run build`) and the debug handle is switched off in the payload.
  const DEBUG = process.env.NR_DEBUG === '1';
  const obfFile = path.join(ROOT, 'game.obf.js');
  if (file === path.join(ROOT, 'game.js') && !DEBUG && fs.existsSync(obfFile)) file = obfFile;
  if (!file.startsWith(ROOT)){ res.writeHead(403); return res.end(); }
  res._gameRaw = file === path.join(ROOT, 'game.js');
  fs.readFile(file, (err, data) => {
    if (err){ res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    // swap in the build token so "game.js?v=…" always points at the file on disk right now —
    // CDN/browser caches can sit on .js for ages even when the HTML asks for no-store, and THAT is how
    // people end up playing a stale build and seeing no changes
    if (path.extname(file) === '.html'){
      const html = data.toString('utf8').replace(/__BUILD__/g, String(fs.statSync(path.join(ROOT, 'game.js')).mtimeMs | 0));
      return res.end(html);
    }
    if (res._gameRaw){
      const js = data.toString('utf8').replace(/window\.__ALLOW_DBG__/g, DEBUG ? 'true' : 'false');
      return res.end(js);
    }
    res.end(data);
  });
});

/* ---- multiplayer relay + round system ---- */
const wss = new WebSocket.Server({ server });
let nextId = 1;
const players = new Map();   // id -> { ws, name, state, score, deaths, vote, modeVote, team, invulnUntil }

const ROUND_LIMIT = 30;
const KNIFE_LIMIT = 15;                                // KNIFE FIGHT: first to 15 stabs — golden shank from 14, no demotions
const AUTO_LIMIT = 20;                                 // AUTOMATICS: auto-only FFA first to 20 — final is LEADLINE MUSKET
const SHOTGUN_LIMIT = 20;                              // SHOTGUNS: shotguns-only first to 20 — final is SNOWBALL SLINGER
const SNIPER_LIMIT = 15;                               // SNIPERS: snipers-only first to 15 — final is ATLAS ROCKET
const ONESHOT_LIMIT = 20;                              // ONE SHOT: pistols only, 1-bullet mag, infinite reserve, first to 20
const JUGG_LIMIT = 60;                                 // JUGGERNAUT: score = seconds as Juggernaut, first to 60
const INFECT_DURATION = 90000;                         // 1:30 survivors must hold
function limitNow(){ if (gameMode === 'knife') return KNIFE_LIMIT; if (gameMode === 'shotgun') return SHOTGUN_LIMIT; if (gameMode === 'sniper') return SNIPER_LIMIT; if (gameMode === 'auto') return AUTO_LIMIT; if (gameMode === 'oneshot') return ONESHOT_LIMIT; if (gameMode === 'juggernaut') return JUGG_LIMIT; if (gameMode === 'infect') return 0; return ROUND_LIMIT; }
const MAPS = ['FORGE', 'NEXUS', 'DUSK YARD', 'COLD STORAGE', 'RIFT DOCKS'];
const MODE_POOL = ['FFA', 'TEAM', 'KNIFE', 'INFECT', 'AUTO', 'SHOTGUN', 'SNIPER', 'ONESHOT', 'JUGG'];
const MODE_NAMES = { FFA:'FREE FOR ALL', TEAM:'RED v BLUE', KNIFE:'KNIFE FIGHT', INFECT:'INFECTION', AUTO:'AUTOMATICS', SHOTGUN:'SHOTGUNS', SNIPER:'SNIPERS ONLY', ONESHOT:'ONE SHOT', JUGG:'JUGGERNAUT' };
let gameMode = 'ffa';           // decided by the lobby's mode vote before every round
const TEAM_NAMES = ['', 'RED TEAM', 'BLUE TEAM', '', 'SURVIVORS', 'INFECTED', 'HUNTERS', 'JUGGERNAUT'];
let infectionEndAt = 0;
let infectionTimer = null;
let revealInterval = null;
let juggernautId = 0;
let juggernautHp = 500;
let juggScoreTimer = null;
function juggHpFor(n){
  n = Math.max(1, n|0);
  // base 200 +50 per player (5 players => 450 HP)
  const hp = 200 + n * 50;
  return Math.max(200, Math.min(hp, 1000));
}
let modeVoteChoices = [];       // 3 random modes per ballot, rotates like maps
let currentMap = MAPS[0];
let roundNo = 0;
let roundActive = false;
let voteChoices = [];
let voteTimer = null;
let voteEndsAt = 0;
let votePhase = null;           // null | 'map' | 'mode' — two ballots per break: pick the map, then pick the game mode
let pendingMap = null;          // map the lobby settled on while the mode vote runs

function hasSpecialChars(v){ return /[^A-Za-z0-9 ]/.test(String(v || '')); }
function safeName(v, id){ const raw = String(v || ('RIFT-' + id)); const stripped = raw.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().replace(/\s+/g,' ').slice(0,14).trim(); return stripped || ('RIFT ' + id).toUpperCase().slice(0,14); }
/* callsign hygiene: nothing hateful/obscene — matched on a leetspeak-collapsed form so
   'sh1t' and 'SHIT' read the same. Matches get replaced, not negotiated with. */
const BAD_NAME_PARTS = ['fuck','shit','bitch','cunt','nigger','nigga','negro','faggot','fag','whore','slut','kike','spic','chink','rape','rapist','pedo','porn','nazi','hitler','dick','cock','pussy','twat','wank','cummer','cum','jizz','tits','boob','penis','vagina','anus','kkk','isis','paki','wetback','coon','dyke','tranny','retard',' bastard '.trim()];
function normCall(v){ return String(v || '').toLowerCase().replace(/[@4]/g,'a').replace(/8/g,'b').replace(/[3€]/g,'e').replace(/[1!|]/g,'i').replace(/0/g,'o').replace(/[5$]/g,'s').replace(/7/g,'t').replace(/[^a-z0-9]+/g,''); }
function nameIsClean(v){ const n = normCall(v); return n.length > 0 && !BAD_NAME_PARTS.some(b => n.includes(normCall(b))); }
function uniqueName(base, selfId){
  const taken = new Set([...players.values()].filter(q => q.ws && players.get(selfId) !== q).map(q => q.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++){
    const cand = (base.slice(0, 11) + ' ' + n).slice(0, 14);
    if (!taken.has(cand)) return cand;
  }
}
function send(ws, o){ if (ws.readyState === 1) ws.send(JSON.stringify(o)); }
function broadcast(o, exceptId){
  const s = Buffer.isBuffer(o) ? o : JSON.stringify(o);
  for (const [id, p] of players)
    if (id !== exceptId && p.ws.readyState === 1) p.ws.send(s);
}
function scoreList(){
  return [...players].map(([id, p]) => ({ id, name:p.name, score:p.score || 0, deaths:p.deaths || 0, team:p.team || 0 }))
    .sort((a,b) => (b.score - a.score) || (a.deaths - b.deaths) || a.name.localeCompare(b.name));
}
function teamTotals(){
  const totals = { red:0, blue:0 };
  if (gameMode === 'team') for (const p of players.values()) (p.team === 2 ? totals.blue += p.score || 0 : p.team === 1 ? totals.red += p.score || 0 : 0);

  return totals;
}
function voteCounts(){
  const counts = {};
  if (votePhase === 'mode'){ for (const m of modeVoteChoices) counts[m] = 0; for (const p of players.values()) if (counts[p.modeVote] !== undefined) counts[p.modeVote]++; return counts; }
  for (const m of voteChoices) counts[m] = 0;
  for (const p of players.values()) if (counts[p.vote] !== undefined) counts[p.vote]++;
  return counts;
}
function pickModeChoices(exclude){
  const pool = MODE_POOL.filter(m => m !== exclude);
  while (pool.length < 3) pool.push(...MODE_POOL);
  const choices = [];
  while (choices.length < Math.min(3, MODE_POOL.length)){
    const idx = Math.floor(Math.random() * pool.length);
    const m = pool.splice(idx, 1)[0];
    if (!choices.includes(m)) choices.push(m);
  }
  return choices;
}
function pickChoices(exclude){
  const pool = MAPS.filter(m => m !== exclude);
  while (pool.length < 3) pool.push(...MAPS);
  const choices = [];
  while (choices.length < Math.min(3, MAPS.length)){
    const idx = Math.floor(Math.random() * pool.length);
    const m = pool.splice(idx, 1)[0];
    if (!choices.includes(m)) choices.push(m);
  }
  return choices;
}
function broadcastScore(){ broadcast({ t:'score', scores:scoreList(), limit:limitNow(), round:roundNo, map:currentMap, active:roundActive, mode:(gameMode || 'ffa'), totals:teamTotals() }); }
/* Ballot counting with NO coin flips: plurality wins, and a tie goes to the option whose EARLIEST
   vote arrived first (first voice breaks the tie). Only a totally empty map ballot stays random —
   somebody has to pick, and if nobody cared, any map is as good as another. */
function earliestVoteAt(prop, choice){
  let best = Infinity;
  for (const p of players.values()) if (p[prop] === choice && (p[prop + 'At'] || Infinity) < best) best = p[prop + 'At'];
  return best;
}
function chooseVoteWinner(){
  const counts = voteCounts();
  if (votePhase === 'mode'){
    let bestCount = -1; const tied = [];
    for (const mch of modeVoteChoices){
      const c = counts[mch] || 0;
      if (c > bestCount){ bestCount = c; tied.length = 0; tied.push(mch); }
      else if (c === bestCount) tied.push(mch);
    }
    if (bestCount === 0) return modeVoteChoices[0] || 'FFA';                            // nobody cared: baseline mode, by design
    let win = tied[0], tBest = Infinity;
    for (const mch of tied){ const t = earliestVoteAt('modeVote', mch); if (t < tBest){ tBest = t; win = mch; } }
    return win;
  }
  let bestCount = -1, tied = [];
  for (const m of voteChoices){
    const c = counts[m] || 0;
    if (c > bestCount){ bestCount = c; tied = [m]; }
    else if (c === bestCount) tied.push(m);
  }
  if (!tied.length) return MAPS[(Math.random() * MAPS.length) | 0];
  if (bestCount === 0) return tied[(Math.random() * tied.length) | 0];   // empty ballot: nothing to honor, spin the wheel
  let win = tied[0], tBest = Infinity;
  for (const m of tied){ const t = earliestVoteAt('vote', m); if (t < tBest){ tBest = t; win = m; } }
  return win;
}
function scheduleVoteEnd(){
  if (voteTimer) clearTimeout(voteTimer);
  voteTimer = setTimeout(closeVotePhase, Math.max(500, voteEndsAt - Date.now()));
}
let voteCtx = { initial:false, winnerId:0, winnerName:'ROUND COMPLETE', winTeam:0 };   // carried from phase 'map' into phase 'mode'
function openVote({ initial=false, winnerId=0, winnerName='ROUND COMPLETE', winTeam=0 } = {}){
  if (voteTimer){ clearTimeout(voteTimer); voteTimer = null; }
  roundActive = false;
  votePhase = 'map';
  pendingMap = null;
  voteCtx = { initial, winnerId, winnerName, winTeam };
  voteChoices = pickChoices(initial ? null : currentMap);   // always 3 of the 5 maps, cycling
  modeVoteChoices = [];
  for (const p of players.values()){ p.vote = null; p.modeVote = null; }
  voteEndsAt = Date.now() + 10000;
  scheduleVoteEnd();
  console.log(new Date().toISOString().slice(11,19), `[vote] map phase open (${initial ? 'initial' : 'next'}), choices=${voteChoices.join(',')}`);
  broadcast({ t:'roundOver', winnerId, winnerName: initial ? 'STARTING MAP' : winnerName, winTeam, scores:scoreList(), choices:voteChoices, counts:voteCounts(), limit:limitNow(), map:currentMap, voteEndsAt, initial, mode:(gameMode || 'ffa'), totals:teamTotals(), phase:'map', now:Date.now() });
}
function closeVotePhase(){
  if (voteTimer){ clearTimeout(voteTimer); voteTimer = null; }
  if (votePhase === 'map'){                       // map settled → same lobby now picks the mode
    pendingMap = chooseVoteWinner();
    votePhase = 'mode';
    // 3 random modes, rotating like maps
    modeVoteChoices = pickModeChoices(gameMode ? gameMode.toUpperCase() : null);
    voteEndsAt = Date.now() + 6000;
    scheduleVoteEnd();
    console.log(new Date().toISOString().slice(11,19), `[vote] map decided: ${pendingMap}; mode phase open choices=${modeVoteChoices.join(',')}`);
    broadcast({ t:'modeVote', map:pendingMap, choices:modeVoteChoices, counts:voteCounts(), voteEndsAt, now:Date.now() });
    return;
  }
  if (votePhase !== 'mode') return;
  // mode decided → lock it in, (re)balance squads if it's teams, then kick off the round
  const votedMode = chooseVoteWinner();
  if (votedMode === 'TEAM') gameMode = 'team';
  else if (votedMode === 'KNIFE') gameMode = 'knife';
  else if (votedMode === 'INFECT') gameMode = 'infect';
  else if (votedMode === 'AUTO') gameMode = 'auto';
  else if (votedMode === 'SHOTGUN') gameMode = 'shotgun';
  else if (votedMode === 'SNIPER') gameMode = 'sniper';
  else if (votedMode === 'ONESHOT') gameMode = 'oneshot';
  else if (votedMode === 'JUGG') gameMode = 'juggernaut';
  else gameMode = 'ffa';
  votePhase = null; voteChoices = []; voteEndsAt = 0;
  if (gameMode === 'team'){
    const ids = [...players.keys()];
    for (let i = ids.length - 1; i > 0; i--){ const j = (Math.random() * (i + 1)) | 0; [ids[i], ids[j]] = [ids[j], ids[i]]; }
    ids.forEach((pid, i) => { players.get(pid).team = (i % 2) + 1; });   // shuffled 1,2,1,2… = balanced RED/BLUE
  } else if (gameMode === 'infect'){
    // infect teams cleared, will be assigned in startRound (1 survivor, 1 infected start)
    for (const p of players.values()){ p.team = 0; p.infected = false; p.isJugg = false; }
  } else if (gameMode === 'juggernaut'){
    for (const p of players.values()){ p.team = 0; p.infected = false; p.isJugg = false; }
  } else for (const p of players.values()){ p.team = 0; p.infected = false; p.isJugg = false; }
  broadcast({ t:'modeDecided', mode:gameMode, modeName:(MODE_NAMES[gameMode.toUpperCase()] || MODE_NAMES.FFA), map:pendingMap || currentMap });
  for (const [pid, p] of players){ send(p.ws, { t:'mode', mode:gameMode, team:p.team || 0, teamName:TEAM_NAMES[p.team] || '' }); broadcast({ t:'team', id:pid, team:p.team || 0 }, pid); }
  console.log(new Date().toISOString().slice(11,19), `[vote] mode decided: ${gameMode}; launching round`);
  setTimeout(() => startRound(pendingMap), 1400);
}
function ensureInitialVote(){
  if (players.size > 0 && !roundActive && !votePhase) openVote({ initial:true, winnerName:'STARTING MAP' });
}
function resetEmptyLobby(){
  if (voteTimer){ clearTimeout(voteTimer); voteTimer = null; }
  roundActive = false;
  voteChoices = [];
  voteEndsAt = 0;
  votePhase = null;
  pendingMap = null;
  roundNo = 0;
  gameMode = 'ffa';
  infectionEndAt = 0;
  juggernautId = 0;
  if (infectionTimer){ clearTimeout(infectionTimer); infectionTimer = null; }
  if (juggScoreTimer){ clearInterval(juggScoreTimer); juggScoreTimer = null; }
  currentMap = MAPS[(Math.random() * MAPS.length) | 0];
}
function startRound(map){
  if (!players.size){ votePhase = null; return; }   // lobby emptied during the ballots — never launch a ghost round
  if (voteTimer){ clearTimeout(voteTimer); voteTimer = null; }
  currentMap = map || currentMap;
  roundNo++;
  roundActive = true;
  voteChoices = [];
  voteEndsAt = 0;
  votePhase = null;
  for (const p of players.values()){
    p.score = 0; p.deaths = 0; p.vote = null; p.modeVote = null; p.state = null; p.invulnUntil = Date.now() + 1500;
    p.lastHitFrom = 0; p.lastHitKnife = false; p.lastHitAt = 0; p.assists = 0; p.dmgLog = new Map();
    // restore original skin if we forced it during infection/jugg
    if (p.origSkin){ p.skin = p.origSkin; delete p.origSkin; }
    p.isJugg = false;
    if (gameMode === 'team'){
      // FIX: preserve shuffled teams assigned in closeVotePhase — don't wipe to 0
      // ensure everyone has a team even if balance shifted (players joined/left during vote)
      // We'll rebalance below for accuracy, but keep at least 1/2 assignment
      if (!p.team) p.team = 1; // temporary, will be rebalanced immediately
      p.infected = false;
    } else {
      p.infected = false; p.team = 0;
    }
    p.lastActiveAt = Date.now();   // fresh round, fresh 15s to actually play it
  }
  // --- RED vs BLUE fix: rebalance teams at round start so existing lobby players don't stay team 0 ---
  if (gameMode === 'team'){
    const ids = [...players.keys()];
    for (let i = ids.length - 1; i > 0; i--){ const j = (Math.random() * (i + 1)) | 0; [ids[i], ids[j]] = [ids[j], ids[i]]; }
    ids.forEach((pid, i) => { players.get(pid).team = (i % 2) + 1; });
    for (const [pid, pl] of players){ send(pl.ws, { t:'mode', mode:gameMode, team:pl.team, teamName:TEAM_NAMES[pl.team]||'' }); broadcast({ t:'team', id:pid, team:pl.team }, pid); }
  }
  if (gameMode !== 'infect' && gameMode !== 'juggernaut'){
    for (const [pid, pl] of players){ broadcast({ t:'skin', id:pid, skin:pl.skin }); }
  }
  if (gameMode === 'infect'){
    // pick EXACTLY ONE patient zero — only 1 zombie at start
    const ids = [...players.keys()];
    const first = ids[Math.floor(Math.random()*ids.length)];
    for (const [pid, pl] of players){
      if (!pl.origSkin) pl.origSkin = pl.skin; // save equipped skin to restore after infection
      if (pid === first){ pl.infected = true; pl.team = 2; pl.skin = 'toxic'; } // green zombie
      else { pl.infected = false; pl.team = 1; pl.skin = 'rift'; } // blue survivors
    }
    infectionEndAt = Date.now() + INFECT_DURATION;
    if (infectionTimer) clearTimeout(infectionTimer);
    // reveal interval for last survivor hide-and-seek trolling
    if (revealInterval) clearInterval(revealInterval);
    infectionTimer = setTimeout(() => {
      if (revealInterval) clearInterval(revealInterval);
      if (!roundActive || gameMode !== 'infect') return;
      const survivors = [...players.values()].filter(q=>!q.infected);
      if (survivors.length > 0){
        console.log(`[infect] survivors held 90s — survivors win`);
        broadcast({ t:'infectWin', winner:'survivors' });
        openVote({ initial:false, winnerId: survivors[0]?.id || 0, winnerName:'SURVIVORS HOLD', winTeam:1 });
      }
    }, INFECT_DURATION + 200);
    // reveal last survivor when 1 left and <20s remain
    if (revealInterval) clearInterval(revealInterval);
    revealInterval = setInterval(()=>{
      if(!roundActive || gameMode!=='infect'){ clearInterval(revealInterval); return; }
      const survivorsR=[...players.values()].filter(q=>!q.infected);
      const left=infectionEndAt-Date.now();
      if(survivorsR.length===1 && left>0 && left<20000){
        const sv=survivorsR[0];
        broadcast({ t:'reveal', id:sv.id, timeLeft:left });
        console.log(`[infect] revealing last survivor ${sv.name} — ${(left/1000)|0}s left`);
        clearInterval(revealInterval);
      }
      if(left<=0) clearInterval(revealInterval);
    }, 4000);
  } else {
    infectionEndAt = 0;
    if (infectionTimer){ clearTimeout(infectionTimer); infectionTimer = null; }
    if (revealInterval){ clearInterval(revealInterval); revealInterval = null; }
  }
  // JUGGERNAUT: pick one juggernaut, hunters vs juggernaut
  if (gameMode === 'juggernaut'){
    juggernautHp = juggHpFor(players.size);
    const ids = [...players.keys()];
    const firstJugg = ids[Math.floor(Math.random()*ids.length)];
    juggernautId = firstJugg || 0;
    for (const [pid, pl] of players){
      if (!pl.origSkin) pl.origSkin = pl.skin;
      if (pid === firstJugg){ pl.isJugg = true; pl.team = 2; pl.skin = 'juggernaut'; pl.juggHp = juggernautHp; }
      else { pl.isJugg = false; pl.team = 1; pl.skin = 'rift'; }
    }
    if (juggScoreTimer) clearInterval(juggScoreTimer);
    // Every second as juggernaut = 1 point, first to JUGG_LIMIT (60) wins
    juggScoreTimer = setInterval(() => {
      if (!roundActive || gameMode !== 'juggernaut' || !juggernautId) { checkJuggNoJuggEnd(); return; }
      const jugg = players.get(juggernautId);
      if (!jugg || !jugg.isJugg) { checkJuggNoJuggEnd(); return; }
      jugg.score = (jugg.score || 0) + 1;
      broadcast({ t:'juggScore', id:juggernautId, score:jugg.score, limit:JUGG_LIMIT, scores:scoreList(), totals:teamTotals() });
      broadcastScore();
      if (jugg.score >= JUGG_LIMIT) finishRound(juggernautId);
    }, 1000);
    for (const [pid, pl] of players){ send(pl.ws, { t:'jugg', id:pid, isJugg:pl.isJugg, juggId:juggernautId, juggHp:juggernautHp }); broadcast({ t:'jugg', id:pid, isJugg:pl.isJugg, juggId:juggernautId, juggHp:juggernautHp }, pid); }
    console.log(`[jugg] picked ${players.get(firstJugg)?.name || firstJugg} as JUGGERNAUT HP=${juggernautHp} for ${players.size} players`);
  } else {
    if (juggScoreTimer){ clearInterval(juggScoreTimer); juggScoreTimer = null; }
    juggernautId = 0;
  }
  const ladderSeed = (Math.random() * 0x7fffffff) | 0;   // one deck-shuffle per round, dealt to everyone equally
  // include infection/jugg state in roundStart for clients
  const infectInfo = gameMode === 'infect' ? { infectedIds: [...players].filter(([_,pl])=>pl.infected).map(([pid])=>pid), endsAt: infectionEndAt } : null;
  const juggInfo = gameMode === 'juggernaut' ? { juggId: juggernautId, juggHp: juggernautHp } : null;
  let buildToken2=0; try{ buildToken2=fs.statSync(require('path').join(ROOT,'game.js')).mtimeMs|0; }catch(e){}
  broadcast({ t:'roundStart', map:currentMap, round:roundNo, limit:limitNow(), scores:scoreList(), mode:gameMode, totals:teamTotals(), ladderSeed, build:buildToken2, infect: infectInfo, jugg: juggInfo });
  console.log(new Date().toISOString().slice(11,19), `[round] ${roundNo} started on ${currentMap} (${gameMode})`);
}
function checkInfectWin(){
  if (gameMode !== 'infect' || !roundActive) return;
  const survivors = [...players.values()].filter(q=>!q.infected);
  const infected = [...players.values()].filter(q=>q.infected);
  if (survivors.length === 0 && infected.length > 0){
    // no survivors left — zombies win immediately (covers leaves/disconnects mid-round)
    console.log(`[infect] no survivors remain — infected win`);
    if (infectionTimer){ clearTimeout(infectionTimer); infectionTimer = null; }
    infectionEndAt = 0;
    broadcast({ t:'infectWin', winner:'infected' });
    openVote({ initial:false, winnerId: infected[0]?.id || 0, winnerName:'INFECTED SWARM', winTeam:2 });
    return true;
  }
  if (infected.length === 0 && survivors.length > 0){
    // edge case: last zombie left/disconnected — promote a survivor to keep round alive
    const pick = survivors[Math.floor(Math.random()*survivors.length)];
    if (pick){
      if (!pick.origSkin) pick.origSkin = pick.skin;
      pick.infected = true; pick.team = 2; pick.skin = 'toxic';
      broadcast({ t:'infect', id: pick.id, team:2, skin:'toxic' });
      console.log(`[infect] no infected remain — promoted ${pick.name} to infected`);
    }
  }
  return false;
}
function checkJuggNoJuggEnd(){
  if (gameMode !== 'juggernaut' || !roundActive) return false;
  const jugg = juggernautId ? players.get(juggernautId) : null;
  const exists = jugg && jugg.isJugg;
  if (!exists){
    console.log(`[jugg] no juggernaut remains — ending round`);
    if (juggScoreTimer){ clearInterval(juggScoreTimer); juggScoreTimer = null; }
    // pick winner: highest time-held score, or first hunter
    const sorted = [...players.values()].sort((a,b)=>(b.score||0)-(a.score||0));
    const winner = sorted[0];
    finishRound(winner ? winner.id : 0);
    return true;
  }
  return false;
}
function checkJuggWinTransfer(oldJuggId, killerId){
  if (gameMode !== 'juggernaut' || !roundActive) return;
  if (oldJuggId !== juggernautId) return; // not the current jugg
  const killer = players.get(killerId);
  if (!killer) return;
  const oldJugg = players.get(oldJuggId);
  if (oldJugg){
    if (oldJugg.origSkin){ oldJugg.skin = oldJugg.origSkin; delete oldJugg.origSkin; }
    oldJugg.isJugg = false; oldJugg.team = 1;
    broadcast({ t:'jugg', id:oldJuggId, isJugg:false, juggId:killerId });
    broadcast({ t:'skin', id:oldJuggId, skin:oldJugg.skin });
  }
  if (!killer.origSkin) killer.origSkin = killer.skin;
  juggernautHp = juggHpFor(players.size);
  killer.juggHp = juggernautHp;
  killer.isJugg = true; killer.team = 2; killer.skin = 'juggernaut'; killer.invulnUntil = Date.now()+1200;
  juggernautId = killerId;
  broadcast({ t:'jugg', id:killerId, isJugg:true, juggId:killerId, juggHp:juggernautHp });
  broadcast({ t:'skin', id:killerId, skin:killer.skin });
  broadcast({ t:'kill', victim:oldJuggId, by:killerId, assist:0, knife:false, bs:false, hs:!!(players.get(oldJuggId)?.lastHitHs), w:(players.get(oldJuggId)?.lastHitWeapon|0), demoted:false, names:{ v:oldJugg?oldJugg.name:'JUGGERNAUT', k:killer.name, a:null }, kteam:killer.team, vteam:oldJugg?oldJugg.team:2, ateam:0, scores:scoreList(), limit:limitNow(), mode:gameMode, totals:teamTotals(), juggTransfer:true });
  console.log(`[jugg] ${killer.name} eliminated juggernaut ${oldJugg?.name || oldJuggId} — now juggernaut is ${killer.name}`);
}
function finishRound(winnerId){
  if (!roundActive) return;
  if (infectionTimer){ clearTimeout(infectionTimer); infectionTimer = null; }
  if (juggScoreTimer){ clearInterval(juggScoreTimer); juggScoreTimer = null; }
  // Same win rule in both modes: ONE runner hits limit.
  const winner = players.get(winnerId);
  openVote({ initial:false, winnerId, winnerName:winner ? winner.name : 'ARENA', winTeam:(winner && (gameMode === 'team' || gameMode === 'infect' || gameMode === 'juggernaut')) ? winner.team : 0 });
  console.log(new Date().toISOString().slice(11,19), `[round] ${winner ? winner.name : winnerId} reached ${limitNow()} and won round ${roundNo}; voting open`);
}
function welcomeState(id){
  const me = players.get(id);
  const infectWelcome = (gameMode === 'infect' && roundActive) ? { infectedIds: [...players].filter(([_,pl])=>pl.infected).map(([pid])=>pid), endsAt: infectionEndAt } : null;
  const juggWelcome = (gameMode === 'juggernaut' && roundActive) ? { juggId: juggernautId, juggHp: juggernautHp } : null;
  // build token for client sync check
  let buildToken = 0; try{ buildToken = fs.statSync(require('path').join(ROOT,'game.js')).mtimeMs|0; }catch(e){}
  return {
    t:'welcome', id, salt: me ? me.salt : 0, build:buildToken, map:currentMap, round:roundNo, limit:limitNow(), active:roundActive, mode:(gameMode || 'ffa'), totals:teamTotals(),
    scores:scoreList(), voteChoices: votePhase === 'mode' ? modeVoteChoices : voteChoices, voteCounts:voteCounts(), voteEndsAt, infect: infectWelcome, jugg: juggWelcome,
    phase: votePhase, pendingMap, winnersName:(!roundActive && votePhase ? voteCtx.winnerName : ''), now:Date.now(),
    players:[...players].filter(([pid]) => pid !== id).map(([pid, q]) => ({ id:pid, name:q.name, skin:q.skin || 'rift', state:q.stateArr || q.state, score:q.score || 0, deaths:q.deaths || 0, team:q.team || 0 }))
  };
}

wss.on('connection', (ws, req) => {
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '') || 'unknown';
  if ((ipConns.get(ip) || 0) >= AC.MAX_IP_CONNS){
    try { send(ws, { t:'kick', reason:'TOO MANY CONNECTIONS FROM THIS ADDRESS' }); ws.close(4003); } catch {}
    return;
  }
  ipConns.set(ip, (ipConns.get(ip) || 0) + 1);

  const id = nextId++;
  const p = { ws, ip, name:'RIFT-' + id, skin:'rift', state:null, stateArr:null, score:0, deaths:0, vote:null, team:0, isJugg:false, invulnUntil:Date.now()+1500, lastHitFrom:0, lastHitKnife:false, lastHitHs:false, lastHitWeapon:0, lastHitAt:0, assists:0, dmgLog:new Map(),
    msgEvents:[], hitEvents:[], knifeHitEvents:[], killEvents:[], spawnEvents:[], shotEvents:[], speedTrail:[], lastState:null, lastSpawnAt:0, spawnGrace:false,
    salt:(Math.random() * 0xFFFFFFFF) >>> 0, dig:0, lastBeatAt:0, gameTraffic:0, lastActiveAt:Date.now(), probation:(probationList.get(ip) || 0) > Date.now() };
  players.set(id, p);
  console.log(new Date().toISOString().slice(11,19), `[+] player ${id} connected (${players.size} online)${p.probation ? ' [PROBATION]' : ''}`);
  ensureInitialVote();

  send(ws, welcomeState(id));

  ws.on('message', (data, isBinary) => {
    const nowM = Date.now();
    if (data.length > 4096){ acKick(p, 'oversized packet'); return; }
    p.msgEvents.push(nowM);
    if (isBinary){ handleStateFrame(id, p, data, nowM); return; }               // position streams travel binary-only
    let m; try { m = JSON.parse(data.toString()); } catch { return; }
    switch (m.t){
      case 'hello': {
        const rawName = String(m.name || '');
        let base = safeName(rawName, id);
        let filtered = false;
        if (hasSpecialChars(rawName) || !nameIsClean(base)){ base = safeName('RIFT ' + id, id); filtered = true; }
        const finalName = uniqueName(base, id);
        const taken = !filtered && finalName !== base;
        p.name = finalName;
        send(p.ws, { t:'named', name:p.name, taken, filtered });
        p.skin = String(m.skin || 'rift').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'rift';
        // mode no longer locks from a button — the lobby votes it in before every round.
        // joining mid team round: slot into the shorthanded squad
        if (gameMode === 'team' && roundActive && !p.team){
          let red = 0, blue = 0;
          for (const q of players.values()) if (q.team === 1) red++; else if (q.team === 2) blue++;
          p.team = red <= blue ? 1 : 2;
          console.log(new Date().toISOString().slice(11,19), `[team] ${p.name} → ${TEAM_NAMES[p.team]} (${red}v${blue})`);
        }
        // infection late join: you spawn as infected (green) — save original for revert after match
        if (gameMode === 'infect' && roundActive){
          if (!p.origSkin) p.origSkin = p.skin;
          p.infected = true; p.team = 2; p.skin = 'toxic';
          // fix: late join zombie was sometimes invincible due to spawn invuln still active
          p.invulnUntil = Date.now(); p.spawnGrace = false;
          console.log(`[infect] late join ${p.name} -> infected (orig ${p.origSkin})`);
          broadcast({ t:'infect', id, team:2, skin:'toxic' });
        } else if (gameMode === 'infect' && !roundActive){
          p.infected = false; p.team = 0;
        }
        // juggernaut late join: spawn as hunter
        if (gameMode === 'juggernaut' && roundActive){
          if (!p.origSkin) p.origSkin = p.skin;
          p.isJugg = false; p.team = 1; p.skin = 'rift';
          console.log(`[jugg] late join ${p.name} -> HUNTER hp pool ${juggernautHp}`);
          broadcast({ t:'jugg', id, isJugg:false, juggId:juggernautId, juggHp:juggernautHp });
        } else if (gameMode === 'juggernaut' && !roundActive){
          p.isJugg = false; p.team = 0;
        }
        if (gameMode !== 'team' && gameMode !== 'infect' && gameMode !== 'juggernaut') p.team = 0;
        send(p.ws, { t:'mode', mode:(gameMode || 'ffa'), team:p.team || 0, teamName:TEAM_NAMES[p.team] || MODE_NAMES.FFA });
        broadcast({ t:'join', id, name:p.name, skin:p.skin, score:p.score, deaths:p.deaths, team:p.team }, id);
        broadcast({ t:'team', id, team:p.team }, id);
        broadcastScore();
        break;
      }
      case 'skin':
        p.skin = String(m.skin || 'rift').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'rift';
        broadcast({ t:'skin', id, skin:p.skin }, id);
        break;
      case 'state':   // legacy road — position streams are binary-only now; JSON here is forgery
        acKick(p, 'non-binary state protocol');
        break;
      case 'shoot': {
        p.gameTraffic = p.gameTraffic || nowM;
        p.lastActiveAt = nowM;   // pulling a trigger counts as playing
        p.lastWeapon = (typeof m.w === 'number' ? m.w : p.lastWeapon) | 0;
        p.shotEvents.push(nowM); // kept as timestamps only: feeds the forged-hit coherence auditor (cap-free)
        broadcast({ t:'shoot', id, o:m.o, p:m.p, w:m.w }, id);
        break;
      }
      case 'hit': {
        p.gameTraffic = p.gameTraffic || nowM;
        p.lastActiveAt = nowM;   // landing steel counts as playing (kill reports don't — corpses have no inputs)
        // the cadence gate polices every phase — a legit client only fires during a live round anyway
        p.hitEvents.push(nowM);
        if (m.knife) p.knifeHitEvents.push(nowM);
        const tgt0 = players.get(m.target);
        if (!roundActive) break;
        const tgt = tgt0;
        if (tgt && gameMode === 'team' && p.team && tgt.team === p.team) break;   // team mode: no friendly fire (or friendly shanks)
        if (tgt && gameMode === 'infect' && p.infected === tgt.infected) break;   // infection: no friendly fire within same side
        if (tgt && gameMode === 'juggernaut' && p.isJugg === tgt.isJugg) break; // juggernaut: hunters vs juggernaut only
        if (tgt && gameMode === 'oneshot' && m.knife) break; // one-shot: no knife allowed
        if (tgt && (tgt.invulnUntil || 0) <= Date.now()){
          // lag compensation: server-side rewind — check distance at lastState vs now (tolerant, not strict kick)
          // we have shooter's last reported position (p.lastState) and target's lastState; if hit claims a far target
          // but our stored states show they were miles apart, it's likely a lagged shot — we still accept but log
          if (p.lastState && tgt.lastState){
            const dist = Math.hypot(p.lastState[0]-tgt.lastState[0], p.lastState[2]-tgt.lastState[2]);
            if (dist > 180) { /* far shot, likely long range — allow */ }
            // store for potential future stricter check; for now we log only
          }
          // track the most recent hit so a kill can be attributed as a shank (demotion rules)
          tgt.lastHitFrom = id;
          tgt.lastHitKnife = !!m.knife;
          tgt.lastHitBackstab = !!m.bs;
          tgt.lastHitHs = !!m.hs;
          tgt.lastHitWeapon = (typeof m.w === 'number' ? m.w : p.lastWeapon) | 0;
          tgt.lastHitAt = Date.now();
          // assist ledger: everyone who lands damage earns a line; a heal or 5 quiet seconds ends your claim
          if (!tgt.dmgLog) tgt.dmgLog = new Map();
          tgt.dmgLog.set(id, Date.now());
          let dmgOut = Math.min(Number(m.dmg) || 0, 200);
          if (p.isJugg) dmgOut = Math.round(dmgOut * 0.8); // juggernaut does 20% less damage
          send(tgt.ws, { t:'hit', from:id, dmg:dmgOut, knife:!!m.knife, hs:!!m.hs, w:(typeof m.w==='number'?m.w:p.lastWeapon), burn:!!m.burn });
        }
        break;
      }
      case 'heal':
        if (p.dmgLog) p.dmgLog.clear();    // patched back up — nobody gets assist credit for old wounds
        break;
      case 'kill': {
        const killerId = Number(m.by) || 0;
        const killer = players.get(killerId);
        // cadence gates: inhuman kill chains, fake-death spam, and would-be framers (the reporter is the victim)
        p.killEvents.push(nowM);
        if (acOver(pg(p, AC.KILL_MAX), p.killEvents, nowM, AC.KILL_WIN)){ acKick(p, `kill spam: ${p.killEvents.length} deaths in ${AC.KILL_WIN}ms`); break; }
        if (killer && killerId !== id){
          killer.killEvents.push(nowM);
          if (acOver(pg(killer, AC.KILL_MAX), killer.killEvents, nowM, AC.KILL_WIN)){ acKick(killer, `kill spam: ${killer.killEvents.length} kills in ${AC.KILL_WIN}ms`); break; }
        }
        // INFECTION: infected knife kills convert survivors
        if (roundActive && gameMode === 'infect'){
          p.deaths = (p.deaths || 0) + 1;
          const killerInf = killer && killer.infected;
          const victimInf = p.infected;
          const isKnifeKill = !!p.lastHitKnife;
          if (killer && killerInf && !victimInf && isKnifeKill){
            // convert survivor to infected (knife only) — preserve original skin
            if (!p.origSkin) p.origSkin = p.skin;
            p.infected = true; p.team = 2; p.skin = 'toxic';
            killer.score = (killer.score || 0) + 1;
            const infKnife = true; const infBs = !!p.lastHitBackstab;
            broadcast({ t:'infect', id, team:2, skin:'toxic', by:killerId });
            broadcast({ t:'kill', victim:id, by:killerId, assist:0, knife:infKnife, bs:infBs, hs:false, w:101, demoted:false, names:{ v:p.name, k:killer ? killer.name : 'ARENA', a:null }, kteam:killer?killer.team:0, vteam:p.team, ateam:0, scores:scoreList(), limit:limitNow(), mode:gameMode, totals:teamTotals() });
            broadcast({ t:'score', scores:scoreList(), limit:limitNow(), round:roundNo, map:currentMap, active:roundActive, mode:gameMode, totals:teamTotals() });
            // check all infected win (also covers 0 survivors via leaves)
            if (checkInfectWin()){ /* already handled */ } else {
              // legacy log for conversion win (kept for clarity if check didn't trigger)
              const survivors2 = [...players.values()].filter(q=>!q.infected);
              if (survivors2.length === 0){
                console.log(`[infect] all survivors converted — infected win`);
                broadcast({ t:'infectWin', winner:'infected' });
                if (infectionTimer){ clearTimeout(infectionTimer); infectionTimer = null; }
                openVote({ initial:false, winnerId:killerId, winnerName:'INFECTED SWARM', winTeam:2 });
              }
            }
            break;
          } else if (killer && !killerInf && victimInf){
            // survivor killed zombie — point but no convert, zombie stays infected
            killer.score = (killer.score || 0) + 1;
          } else if (killer && killerId !== id){
            // other combos: survivor vs survivor or zombie vs zombie shouldn't happen due to friendly fire block, but still award
            killer.score = (killer.score || 0) + 1;
          }
          // for non-convert infect kills, compute knife/backstab from stored lastHit
          const infKnife2 = !!p.lastHitKnife; const infBs2 = !!p.lastHitBackstab;
          p.lastHitKnife = false; p.lastHitBackstab = false; p.lastHitFrom = 0;
          p.dmgLog = new Map();
          broadcast({ t:'kill', victim:id, by:killerId, assist:0, knife:infKnife2, bs:infBs2, hs:!!p.lastHitHs, w:(p.lastHitWeapon|0), demoted:false, names:{ v:p.name, k:killer ? killer.name : 'ARENA', a:null }, kteam: killer ? killer.team : 0, vteam: p.team, ateam:0, scores:scoreList(), limit:limitNow(), mode:(gameMode || 'ffa'), totals:teamTotals() });
          broadcastScore();
          break;
        }
        // JUGGERNAUT: hunter kills juggernaut → hunter becomes juggernaut; no demotions, no assists, score only via time
        if (roundActive && gameMode === 'juggernaut'){
          p.deaths = (p.deaths || 0) + 1;
          const wasJugg = !!p.isJugg;
          if (killer && killerId !== id && wasJugg && !killer.isJugg){
            // transfer will broadcast its own kill with juggTransfer flag — don't double-broadcast
            checkJuggWinTransfer(id, killerId);
            p.lastHitKnife = false; p.lastHitBackstab = false; p.lastHitFrom = 0; p.dmgLog = new Map();
            broadcastScore();
            break;
          }
          if (wasJugg){
            // juggernaut died without valid hunter killer (suicide/env) -> no juggernaut, end
            juggernautId = 0;
            if (juggScoreTimer){ clearInterval(juggScoreTimer); juggScoreTimer = null; }
            console.log(`[jugg] juggernaut ${p.name} died with no killer — ending round`);
            const sorted2 = [...players.values()].sort((a,b)=>(b.score||0)-(a.score||0));
            finishRound(sorted2[0] ? sorted2[0].id : 0);
            p.lastHitKnife = false; p.lastHitBackstab = false; p.lastHitFrom = 0; p.dmgLog = new Map();
            broadcast({ t:'kill', victim:id, by:killerId, assist:0, knife:false, bs:false, hs:!!p.lastHitHs, w:(p.lastHitWeapon|0), demoted:false, names:{ v:p.name, k:killer ? killer.name : 'ARENA', a:null }, kteam: killer ? killer.team : 0, vteam: p.team, ateam:0, scores:scoreList(), limit:limitNow(), mode:gameMode, totals:teamTotals() });
            broadcastScore();
            break;
          }
          // juggernaut killing hunter — +1 second bonus (every kill as juggernaut adds 1s)
          const jKnife = !!p.lastHitKnife; const jBs = !!p.lastHitBackstab;
          p.lastHitKnife = false; p.lastHitBackstab = false; p.lastHitFrom = 0; p.dmgLog = new Map();
          if (killer && killer.isJugg){
            killer.score = (killer.score || 0) + 1;
            broadcast({ t:'juggScore', id:killerId, score:killer.score, limit:JUGG_LIMIT, scores:scoreList(), totals:teamTotals() });
            if (killer.score >= JUGG_LIMIT) { broadcast({ t:'kill', victim:id, by:killerId, assist:0, knife:jKnife, bs:jBs, hs:!!p.lastHitHs, w:(p.lastHitWeapon|0), demoted:false, names:{ v:p.name, k:killer ? killer.name : 'ARENA', a:null }, kteam: killer ? killer.team : 0, vteam: p.team, ateam:0, scores:scoreList(), limit:limitNow(), mode:gameMode, totals:teamTotals() }); broadcastScore(); finishRound(killerId); break; }
          }
          broadcast({ t:'kill', victim:id, by:killerId, assist:0, knife:jKnife, bs:jBs, hs:!!p.lastHitHs, w:(p.lastHitWeapon|0), demoted:false, names:{ v:p.name, k:killer ? killer.name : 'ARENA', a:null }, kteam: killer ? killer.team : 0, vteam: p.team, ateam:0, scores:scoreList(), limit:limitNow(), mode:gameMode, totals:teamTotals() });
          broadcastScore();
          break;
        }
        let knifeKill = false, backstab = false, demoted = false, assistId = 0;
        if (roundActive){
          p.deaths = (p.deaths || 0) + 1;
          knifeKill = !!(killer && killerId !== id && p.lastHitFrom === killerId && p.lastHitKnife && (Date.now() - (p.lastHitAt || 0)) < 2500);
          backstab = knifeKill && !!p.lastHitBackstab;
          if (knifeKill && p.score > 0 && gameMode !== 'knife'){ p.score -= 1; demoted = true; }   // shanked: lose a point, drop a gun tier (never below 0). KNIFE FIGHT: points are sacred, no demotions
          if (killer && killerId !== id) killer.score = (killer.score || 0) + 1;
          // ASSIST — TEAM MODE ONLY, and ONLY inside the killer's own squad: the most recent same-team
          // damager who didn't finish the kill still gets a point. Claim lapses 5s after your last hit
          // on the victim, and a heal wipes the ledger. In FFA and KNIFE FIGHT points are personal
          // business — nobody co-signs a kill.
          const nowK = Date.now();
          let bestT = 0;
          if (gameMode === 'team' && killer && killer.team){
            for (const [aid, ts] of (p.dmgLog || [])){
              if (aid === killerId || !players.has(aid)) continue;
              if (nowK - ts > 5000) continue;
              if (players.get(aid).team !== killer.team) continue;
              if (ts > bestT){ bestT = ts; assistId = aid; }
            }
          }
          if (assistId){
            const a = players.get(assistId);
            // the final point can only ever be a Kill You Landed Yourself — an assist stops one short.
            if ((a.score || 0) < limitNow() - 1){ a.score += 1; a.assists = (a.assists || 0) + 1; }
            else assistId = 0;
          }
          p.lastHitKnife = false; p.lastHitBackstab = false; p.lastHitFrom = 0;
          p.dmgLog = new Map();
        }
        const assister = players.get(assistId);
        broadcast({ t:'kill', victim:id, by:killerId, assist:assistId, knife:knifeKill, bs:backstab, hs:!!p.lastHitHs, w:(p.lastHitWeapon|0), demoted, names:{ v:p.name, k:killer ? killer.name : 'ARENA', a: assister ? assister.name : null }, kteam: killer ? killer.team : 0, vteam: p.team, ateam: assister ? assister.team : 0, scores:scoreList(), limit:limitNow(), mode:(gameMode || 'ffa'), totals:teamTotals() });
        broadcastScore();
        if (roundActive && killer && killer.score >= limitNow()) finishRound(killerId);   // only a self-landed kill ends a round
        break;
      }
      case 'beat': {  // integrity heartbeat — must echo the live nonce and swear a consistent build digest
        const e = Number(m.e) >>> 0, d = Number(m.d) >>> 0;
        if (e !== BEAT.nonceEcho(handNonce, p.salt) && e !== BEAT.nonceEcho((handNonce - 1) >>> 0, p.salt))
          break;   // parroting stale noise, not a live client loop
        p.lastBeatAt = nowM;
        if (p.dig && d !== p.dig){ acKick(p, 'code digest drifted mid-match (patched at runtime?)'); break; }
        p.dig = d;
        // consensus: when ≥2 others swear one digest and you swear another, your build is the odd one out
        const others = new Map();
        for (const q of players.values()) if (q !== p && q.dig) others.set(q.dig, (others.get(q.dig) || 0) + 1);
        let top = 0; for (const c of others.values()) top = Math.max(top, c);
        if (top >= 2 && !others.has(d)) acKick(p, 'build digest diverges from lobby (patched client?)');
        break;
      }
      case 'spawn':
        // grace grants exactly one free jump (see the state gate); cadence still capped because
        // a welcome-spawn and a round-start respawn can legitimately land a second apart.
        p.spawnEvents.push(nowM);
        if (acOver(pg(p, 3), p.spawnEvents, nowM, 2000)){ acKick(p, `spawn spam (${p.spawnEvents.length} reports in 2s)`); break; }
        p.invulnUntil = Date.now() + 1500;
        p.lastSpawnAt = Date.now();
        p.spawnGrace = true;
        break;
      case 'vote': {
        const choice = String(m.map || '');
        if (roundActive) break;
        if (votePhase === 'mode'){
          if (modeVoteChoices.includes(choice)){ p.modeVote = choice; p.modeVoteAt = Date.now(); broadcast({ t:'voteUpdate', phase:'mode', choices:modeVoteChoices, counts:voteCounts(), voter:id, map:choice, voteEndsAt, now:Date.now() }); }
        } else if (votePhase === 'map' && voteChoices.includes(choice)){
          p.vote = choice; p.voteAt = Date.now();
          broadcast({ t:'voteUpdate', phase:'map', choices:voteChoices, counts:voteCounts(), voter:id, map:choice, voteEndsAt, now:Date.now() });
        }
        break;
      }
    }
  });

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('close', () => {
    const wasInfect = p.infected;
    players.delete(id);
    if (ipConns.get(p.ip)) ipConns.set(p.ip, Math.max(0, (ipConns.get(p.ip) || 1) - 1));
    broadcast({ t:'leave', id });
    broadcastScore();
    if (players.size === 0){ if (juggScoreTimer){ clearInterval(juggScoreTimer); juggScoreTimer=null; } resetEmptyLobby(); }
    else if (roundActive && gameMode === 'infect'){
      // if a survivor left and none remain, zombies win; if last zombie left, promote a survivor
      checkInfectWin();
    } else if (roundActive && gameMode === 'juggernaut'){
      if (id === juggernautId){
        juggernautId = 0;
        console.log(`[jugg] juggernaut ${p.name} left — no juggernaut, ending round`);
        if (juggScoreTimer){ clearInterval(juggScoreTimer); juggScoreTimer = null; }
        const sorted = [...players.values()].sort((a,b)=>(b.score||0)-(a.score||0));
        finishRound(sorted[0] ? sorted[0].id : 0);
      } else {
        checkJuggNoJuggEnd();
      }
    }
    console.log(`[-] player ${id} left (${players.size} online)` + (wasInfect ? ' [was infected]' : ''));
  });
});

/* ---- binary state protocol: [0xA1 | x,y,z,yaw:f32 | slot:u8 | slide:u8 | crouch:u8] ---- */
function handleStateFrame(id, p, buf, nowM){
  if (buf.length !== 20 || buf[0] !== 0xA1){ acKick(p, 'garbage binary state frame'); return; }
  const x = buf.readFloatLE(1), y = buf.readFloatLE(5), z = buf.readFloatLE(9), yaw = buf.readFloatLE(13);
  if (![x, y, z, yaw].every(Number.isFinite)){ acKick(p, 'garbage position packet'); return; }
  const prev = p.lastState;
  p.lastState = [x, y, z, nowM, yaw];
  p.stateArr = [x, y, z, yaw, buf[17], buf[18], buf[19]];
  const dx = prev ? x - prev[0] : 0, dy = prev ? y - prev[1] : 0, dz = prev ? z - prev[2] : 0;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const jumped = prev && d > pg(p, AC.TPORT);
  if (p.spawnGrace){
    if (jumped) p.spawnGrace = false;    // that jump was the respawn itself — exactly the one free pass
  } else if (jumped){
    acKick(p, `teleport ${d.toFixed(1)}m in ${nowM - prev[3]}ms`); return;
  }
  if (!prev || d > 0.05 || Math.abs(yaw - (prev[4] || 0)) > 0.01) p.lastActiveAt = nowM;   // motion or looking around = alive
  if (prev && !jumped){                // sustained-speed audit — bursts are fine, trends are not
    p.speedTrail.push([nowM, d]);
    const cutoff = nowM - AC.SPEED_WIN;
    p.speedTrail = p.speedTrail.filter(e => e[0] > cutoff);
    let sum = 0; for (const e of p.speedTrail) sum += e[1];
    if (sum > pg(p, AC.SPEED_MAX)){ acKick(p, `speed hack: ${sum.toFixed(0)}m travelled in ${AC.SPEED_WIN}ms`); return; }
  }
  const head = Buffer.allocUnsafe(3); head[0] = 0xA2; head.writeUInt16LE(id, 1);
  broadcast(Buffer.concat([head, buf]), id);
}

/* ---- integrity heartbeat rotation + coherence auditor ---- */
let handNonce = (Math.random() * 0xFFFFFFFF) | 0;
setInterval(() => {
  if (!players.size) return;
  handNonce = (handNonce + 1) >>> 0;   // sequential: the previous nonce is accepted as "in flight"
  broadcast({ t:'hand', n:handNonce });
}, AC.HAND_MS);

setInterval(() => {
  const now = Date.now();
  for (const p of players.values()){
    // failsafe 1a — gameplay reporters that never took the oath: forged clients, not browsers
    if (p.gameTraffic && !p.lastBeatAt && now - p.gameTraffic > AC.BEAT_MS){ acKick(p, 'heartbeat silent — socket bot, not a client'); continue; }
    // failsafe 2a — damage that flies without ballistics traffic (knife hits excluded — blades don't shoot)
    const freshHits = acCount(p.hitEvents, now, 15000) - acCount(p.knifeHitEvents, now, 15000);
    if (freshHits > 10 && acCount(p.shotEvents, now, 15000) === 0){ acKick(p, 'phantom damage: hits with no shots (coherence auditor)'); continue; }

    // inactivity eviction — mid-round only: no movement, no aim, no trigger for AC.AFK_MS (0 = off).
    // Vote phases are exempt: watching a ballot isn't forsaking the match.
    if (AC.AFK_MS > 0 && roundActive && now - (p.lastActiveAt || 0) > AC.AFK_MS) { idleKick(p); continue; }
    // infection safeguard: if survivors vanish due to kicks/idle, end round immediately
    if (roundActive && gameMode === 'infect') checkInfectWin();
    if (roundActive && gameMode === 'juggernaut') checkJuggNoJuggEnd();
  }
}, AC.AUDIT_MS);

setInterval(() => {
  for (const p of players.values()){
    if (!p.ws || p.ws.readyState !== 1) continue;
    if (p.ws.isAlive === false){ try { p.ws.terminate(); } catch {} continue; }
    p.ws.isAlive = false;
    try { p.ws.ping(); } catch {}
  }
}, 25000);

server.listen(PORT, '0.0.0.0', () => console.log('NEON RIFT: BLACKOUT server running on http://0.0.0.0:' + PORT));

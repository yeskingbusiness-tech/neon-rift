/* NEON RIFT: BLACKOUT — static file + LAN multiplayer server
   Usage: npm install && node server.js (then open http://<this-machine's-ip>:8000 on any LAN device) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;
const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon', '.json':'application/json',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)){ res.writeHead(403); return res.end(); }
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
    res.end(data);
  });
});

/* ---- multiplayer relay + round system ---- */
const wss = new WebSocket.Server({ server });
let nextId = 1;
const players = new Map();   // id -> { ws, name, state, score, deaths, vote, modeVote, team, invulnUntil }

const ROUND_LIMIT = 30;
const KNIFE_LIMIT = 15;                                // KNIFE FIGHT: first to 15 stabs — golden shank from 14, no demotions
function limitNow(){ return gameMode === 'knife' ? KNIFE_LIMIT : ROUND_LIMIT; }
const MAPS = ['FORGE', 'NEXUS', 'DUSK YARD', 'COLD STORAGE', 'RIFT DOCKS'];
const MODE_CHOICES = ['FFA', 'TEAM', 'KNIFE'];
const MODE_NAMES = { FFA:'FREE FOR ALL', TEAM:'RED v BLUE', KNIFE:'KNIFE FIGHT' };
let gameMode = 'ffa';           // decided by the lobby's mode vote before every round
const TEAM_NAMES = ['', 'RED TEAM', 'BLUE TEAM'];
let currentMap = MAPS[0];
let roundNo = 0;
let roundActive = false;
let voteChoices = [];
let voteTimer = null;
let voteEndsAt = 0;
let votePhase = null;           // null | 'map' | 'mode' — two ballots per break: pick the map, then pick the game mode
let pendingMap = null;          // map the lobby settled on while the mode vote runs

function safeName(v, id){ return String(v || ('RIFT-' + id)).toUpperCase().replace(/[<>]/g, '').slice(0, 14); }
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
  const s = JSON.stringify(o);
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
  if (votePhase === 'mode'){ for (const m of MODE_CHOICES) counts[m] = 0; for (const p of players.values()) if (counts[p.modeVote] !== undefined) counts[p.modeVote]++; return counts; }
  for (const m of voteChoices) counts[m] = 0;
  for (const p of players.values()) if (counts[p.vote] !== undefined) counts[p.vote]++;
  return counts;
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
    for (const mch of MODE_CHOICES){
      const c = counts[mch] || 0;
      if (c > bestCount){ bestCount = c; tied.length = 0; tied.push(mch); }
      else if (c === bestCount) tied.push(mch);
    }
    if (bestCount === 0) return 'FFA';                            // nobody cared: baseline mode, by design
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
    voteEndsAt = Date.now() + 6000;
    scheduleVoteEnd();
    console.log(new Date().toISOString().slice(11,19), `[vote] map decided: ${pendingMap}; mode phase open`);
    broadcast({ t:'modeVote', map:pendingMap, choices:MODE_CHOICES, counts:voteCounts(), voteEndsAt, now:Date.now() });
    return;
  }
  if (votePhase !== 'mode') return;
  // mode decided → lock it in, (re)balance squads if it's teams, then kick off the round
  const votedMode = chooseVoteWinner();
  gameMode = votedMode === 'TEAM' ? 'team' : (votedMode === 'KNIFE' ? 'knife' : 'ffa');
  votePhase = null; voteChoices = []; voteEndsAt = 0;
  if (gameMode === 'team'){
    const ids = [...players.keys()];
    for (let i = ids.length - 1; i > 0; i--){ const j = (Math.random() * (i + 1)) | 0; [ids[i], ids[j]] = [ids[j], ids[i]]; }
    ids.forEach((pid, i) => { players.get(pid).team = (i % 2) + 1; });   // shuffled 1,2,1,2… = balanced RED/BLUE
  } else for (const p of players.values()) p.team = 0;
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
  }
  const ladderSeed = (Math.random() * 0x7fffffff) | 0;   // one deck-shuffle per round, dealt to everyone equally
  broadcast({ t:'roundStart', map:currentMap, round:roundNo, limit:limitNow(), scores:scoreList(), mode:gameMode, totals:teamTotals(), ladderSeed });
  console.log(new Date().toISOString().slice(11,19), `[round] ${roundNo} started on ${currentMap} (${gameMode})`);
}
function finishRound(winnerId){
  if (!roundActive) return;
  // Same win rule in both modes: ONE runner hits 30 kills. Team play only means no friendly fire.
  const winner = players.get(winnerId);
  openVote({ initial:false, winnerId, winnerName:winner ? winner.name : 'ARENA', winTeam:(winner && (gameMode === 'team')) ? winner.team : 0 });
  console.log(new Date().toISOString().slice(11,19), `[round] ${winner ? winner.name : winnerId} reached ${limitNow()} and won round ${roundNo}; voting open`);
}
function welcomeState(id){
  return {
    t:'welcome', id, map:currentMap, round:roundNo, limit:limitNow(), active:roundActive, mode:(gameMode || 'ffa'), totals:teamTotals(),
    scores:scoreList(), voteChoices: votePhase === 'mode' ? MODE_CHOICES : voteChoices, voteCounts:voteCounts(), voteEndsAt,
    phase: votePhase, pendingMap, winnersName:(!roundActive && votePhase ? voteCtx.winnerName : ''), now:Date.now(),
    players:[...players].filter(([pid]) => pid !== id).map(([pid, q]) => ({ id:pid, name:q.name, skin:q.skin || 'rift', state:q.state, score:q.score || 0, deaths:q.deaths || 0, team:q.team || 0 }))
  };
}

wss.on('connection', ws => {
  const id = nextId++;
  const p = { ws, name:'RIFT-' + id, skin:'rift', state:null, score:0, deaths:0, vote:null, team:0, invulnUntil:Date.now()+1500, lastHitFrom:0, lastHitKnife:false, lastHitAt:0, assists:0, dmgLog:new Map() };
  players.set(id, p);
  console.log(new Date().toISOString().slice(11,19), `[+] player ${id} connected (${players.size} online)`);
  ensureInitialVote();

  send(ws, welcomeState(id));

  ws.on('message', data => {
    let m; try { m = JSON.parse(data); } catch { return; }
    switch (m.t){
      case 'hello': {
        let base = safeName(m.name, id);
        let filtered = false;
        if (!nameIsClean(base)){ base = safeName('RIFT-' + id, id); filtered = true; }
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
        if (gameMode !== 'team') p.team = 0;
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
      case 'state':
        p.state = m.s;
        broadcast({ t:'state', id, s:m.s }, id);
        break;
      case 'shoot':
        broadcast({ t:'shoot', id, o:m.o, p:m.p, w:m.w }, id);
        break;
      case 'hit': {
        if (!roundActive) break;
        const tgt = players.get(m.target);
        if (tgt && gameMode === 'team' && p.team && tgt.team === p.team) break;   // team mode: no friendly fire (or friendly shanks)
        if (tgt && (tgt.invulnUntil || 0) <= Date.now()){
          // track the most recent hit so a kill can be attributed as a shank (demotion rules)
          tgt.lastHitFrom = id;
          tgt.lastHitKnife = !!m.knife;
          tgt.lastHitBackstab = !!m.bs;
          tgt.lastHitAt = Date.now();
          // assist ledger: everyone who lands damage earns a line; a heal or 5 quiet seconds ends your claim
          if (!tgt.dmgLog) tgt.dmgLog = new Map();
          tgt.dmgLog.set(id, Date.now());
          send(tgt.ws, { t:'hit', from:id, dmg:Math.min(Number(m.dmg) || 0, 200), knife:!!m.knife, burn:!!m.burn });
        }
        break;
      }
      case 'heal':
        if (p.dmgLog) p.dmgLog.clear();    // patched back up — nobody gets assist credit for old wounds
        break;
      case 'kill': {
        const killerId = Number(m.by) || 0;
        const killer = players.get(killerId);
        let knifeKill = false, backstab = false, demoted = false, assistId = 0;
        if (roundActive){
          p.deaths = (p.deaths || 0) + 1;
          knifeKill = !!(killer && killerId !== id && p.lastHitFrom === killerId && p.lastHitKnife && (Date.now() - (p.lastHitAt || 0)) < 2500);
          backstab = knifeKill && !!p.lastHitBackstab;
          if (knifeKill && p.score > 0 && gameMode !== 'knife'){ p.score -= 1; demoted = true; }   // shanked: lose a point, drop a gun tier (never below 0). KNIFE FIGHT: points are sacred, no demotions
          if (killer && killerId !== id) killer.score = (killer.score || 0) + 1;
          // ASSIST: the kill goes to the finisher, but the OTHER most recent damager still gets a point.
          // Claim lapses 5s after your last hit on the victim, and a heal wipes the ledger entirely.
          const nowK = Date.now();
          let bestT = 0;
          for (const [aid, ts] of (p.dmgLog || [])){
            if (aid === killerId || !players.has(aid)) continue;
            if (nowK - ts > 5000) continue;
            if (ts > bestT){ bestT = ts; assistId = aid; }
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
        broadcast({ t:'kill', victim:id, by:killerId, assist:assistId, knife:knifeKill, bs:backstab, demoted, names:{ v:p.name, k:killer ? killer.name : 'ARENA', a: assister ? assister.name : null }, kteam: killer ? killer.team : 0, vteam: p.team, ateam: assister ? assister.team : 0, scores:scoreList(), limit:limitNow(), mode:(gameMode || 'ffa'), totals:teamTotals() });
        broadcastScore();
        if (roundActive && killer && killer.score >= limitNow()) finishRound(killerId);   // only a self-landed kill ends a round
        break;
      }
      case 'spawn':
        p.invulnUntil = Date.now() + 1500;
        break;
      case 'vote': {
        const choice = String(m.map || '');
        if (roundActive) break;
        if (votePhase === 'mode'){
          if (MODE_CHOICES.includes(choice)){ p.modeVote = choice; p.modeVoteAt = Date.now(); broadcast({ t:'voteUpdate', phase:'mode', choices:MODE_CHOICES, counts:voteCounts(), voter:id, map:choice, voteEndsAt, now:Date.now() }); }
        } else if (votePhase === 'map' && voteChoices.includes(choice)){
          p.vote = choice; p.voteAt = Date.now();
          broadcast({ t:'voteUpdate', phase:'map', choices:voteChoices, counts:voteCounts(), voter:id, map:choice, voteEndsAt, now:Date.now() });
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcast({ t:'leave', id });
    broadcastScore();
    if (players.size === 0) resetEmptyLobby();
    console.log(`[-] player ${id} left (${players.size} online)`);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log('NEON RIFT: BLACKOUT server running on http://0.0.0.0:' + PORT));

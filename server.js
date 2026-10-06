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
    res.end(data);
  });
});

/* ---- multiplayer relay + round system ---- */
const wss = new WebSocket.Server({ server });
let nextId = 1;
const players = new Map();   // id -> { ws, name, state, score, deaths, vote, invulnUntil }

const ROUND_LIMIT = 30;
const MAPS = ['FORGE', 'NEXUS', 'DUSK YARD'];
let currentMap = MAPS[0];
let roundNo = 0;
let roundActive = false;
let voteChoices = [];
let voteTimer = null;
let voteEndsAt = 0;

function safeName(v, id){ return String(v || ('RIFT-' + id)).toUpperCase().replace(/[<>]/g, '').slice(0, 14); }
function send(ws, o){ if (ws.readyState === 1) ws.send(JSON.stringify(o)); }
function broadcast(o, exceptId){
  const s = JSON.stringify(o);
  for (const [id, p] of players)
    if (id !== exceptId && p.ws.readyState === 1) p.ws.send(s);
}
function scoreList(){
  return [...players].map(([id, p]) => ({ id, name:p.name, score:p.score || 0, deaths:p.deaths || 0 }))
    .sort((a,b) => (b.score - a.score) || (a.deaths - b.deaths) || a.name.localeCompare(b.name));
}
function voteCounts(){
  const counts = {};
  for (const m of voteChoices) counts[m] = 0;
  for (const p of players.values()) if (counts[p.vote] !== undefined) counts[p.vote]++;
  return counts;
}
function pickChoices(){
  const pool = MAPS.filter(m => m !== currentMap);
  while (pool.length < 3) pool.push(...MAPS);
  const choices = [];
  while (choices.length < Math.min(3, MAPS.length)){
    const idx = Math.floor(Math.random() * pool.length);
    const m = pool.splice(idx, 1)[0];
    if (!choices.includes(m)) choices.push(m);
  }
  return choices;
}
function broadcastScore(){ broadcast({ t:'score', scores:scoreList(), limit:ROUND_LIMIT, round:roundNo, map:currentMap, active:roundActive }); }
function chooseVoteWinner(){
  const counts = voteCounts();
  let best = voteChoices[(Math.random() * voteChoices.length) | 0] || MAPS[(Math.random()*MAPS.length)|0], bestCount = counts[best] || 0;
  for (const m of voteChoices){
    const c = counts[m] || 0;
    if (c > bestCount || (c === bestCount && Math.random() > 0.5)){ best = m; bestCount = c; }
  }
  return best;
}
function scheduleVoteEnd(){
  if (voteTimer) clearTimeout(voteTimer);
  voteTimer = setTimeout(() => startRound(chooseVoteWinner()), Math.max(500, voteEndsAt - Date.now()));
}
function openVote({ initial=false, winnerId=0, winnerName='ROUND COMPLETE' } = {}){
  if (voteTimer){ clearTimeout(voteTimer); voteTimer = null; }
  roundActive = false;
  voteChoices = initial ? [...MAPS].sort(() => Math.random() - 0.5) : pickChoices();
  for (const p of players.values()) p.vote = null;
  voteEndsAt = Date.now() + 10000;
  scheduleVoteEnd();
  broadcast({ t:'roundOver', winnerId, winnerName: initial ? 'STARTING MAP' : winnerName, scores:scoreList(), choices:voteChoices, counts:voteCounts(), limit:ROUND_LIMIT, map:currentMap, voteEndsAt, initial });
}
function ensureInitialVote(){
  if (players.size > 0 && !roundActive && voteChoices.length === 0) openVote({ initial:true, winnerName:'STARTING MAP' });
}
function resetEmptyLobby(){
  if (voteTimer){ clearTimeout(voteTimer); voteTimer = null; }
  roundActive = false;
  voteChoices = [];
  voteEndsAt = 0;
  roundNo = 0;
  currentMap = MAPS[(Math.random() * MAPS.length) | 0];
}
function startRound(map){
  if (voteTimer){ clearTimeout(voteTimer); voteTimer = null; }
  currentMap = map || currentMap;
  roundNo++;
  roundActive = true;
  voteChoices = [];
  voteEndsAt = 0;
  for (const p of players.values()){
    p.score = 0; p.deaths = 0; p.vote = null; p.state = null; p.invulnUntil = Date.now() + 1500;
  }
  broadcast({ t:'roundStart', map:currentMap, round:roundNo, limit:ROUND_LIMIT, scores:scoreList() });
  console.log(`[round] ${roundNo} started on ${currentMap}`);
}
function finishRound(winnerId){
  if (!roundActive) return;
  const winner = players.get(winnerId);
  openVote({ initial:false, winnerId, winnerName:winner ? winner.name : 'ARENA' });
  console.log(`[round] ${winner ? winner.name : winnerId} reached ${ROUND_LIMIT} and won round ${roundNo}; voting open`);
}
function welcomeState(id){
  return {
    t:'welcome', id, map:currentMap, round:roundNo, limit:ROUND_LIMIT, active:roundActive,
    scores:scoreList(), voteChoices, voteCounts:voteCounts(), voteEndsAt, winnerName:(!roundActive && voteChoices.length ? (roundNo === 0 ? 'STARTING MAP' : 'ROUND COMPLETE') : ''),
    players:[...players].filter(([pid]) => pid !== id).map(([pid, q]) => ({ id:pid, name:q.name, skin:q.skin || 'rift', state:q.state, score:q.score || 0, deaths:q.deaths || 0 }))
  };
}

wss.on('connection', ws => {
  const id = nextId++;
  const p = { ws, name:'RIFT-' + id, skin:'rift', state:null, score:0, deaths:0, vote:null, invulnUntil:Date.now()+1500 };
  players.set(id, p);
  console.log(`[+] player ${id} connected (${players.size} online)`);
  ensureInitialVote();

  send(ws, welcomeState(id));

  ws.on('message', data => {
    let m; try { m = JSON.parse(data); } catch { return; }
    switch (m.t){
      case 'hello':
        p.name = safeName(m.name, id);
        p.skin = String(m.skin || 'rift').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'rift';
        broadcast({ t:'join', id, name:p.name, skin:p.skin, score:p.score, deaths:p.deaths }, id);
        broadcastScore();
        break;
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
        if (tgt && (tgt.invulnUntil || 0) <= Date.now()) send(tgt.ws, { t:'hit', from:id, dmg:Math.min(Number(m.dmg) || 0, 200) });
        break;
      }
      case 'kill': {
        const killerId = Number(m.by) || 0;
        const killer = players.get(killerId);
        if (roundActive){
          p.deaths = (p.deaths || 0) + 1;
          if (killer && killerId !== id) killer.score = (killer.score || 0) + 1;
        }
        broadcast({ t:'kill', victim:id, by:killerId, names:{ v:p.name, k:killer ? killer.name : 'ARENA' }, scores:scoreList(), limit:ROUND_LIMIT });
        broadcastScore();
        if (roundActive && killer && killer.score >= ROUND_LIMIT) finishRound(killerId);
        break;
      }
      case 'spawn':
        p.invulnUntil = Date.now() + 1500;
        break;
      case 'vote': {
        const choice = String(m.map || '');
        if (!roundActive && voteChoices.includes(choice)){
          p.vote = choice;
          broadcast({ t:'voteUpdate', choices:voteChoices, counts:voteCounts(), voter:id, map:choice, voteEndsAt });
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

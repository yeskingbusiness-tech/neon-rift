# NEON RIFT: BLACKOUT — Arena FPS

A 15-wave solo survival + LAN deathmatch shooter that runs in your browser.

## Current features
- Saved progression: XP, levels, credits, total kills, solo wave records, LAN wins
- 17 character skins in the shop, with saved unlocks and LAN-visible selected skins. **Skin colors are true to the swatch** — torso, arms, head, and every dark seam (legs, shoulder plate, boots, hands) follows the skin's color story. No stealth-black shells remain (they were pay-to-invisible): replaced by gradient frames like **Duskfall Fade** and **Nebula Sheath**. And the crown jewel: **VOID MONARCH** — a pitch-white shell with void-black seams, **$100,000 and level 50 required**
- 72-weapon arsenal: rifles, SMGs, LMGs, pistols, shotguns, DMRs, snipers, rail/exotic weapons — plus an ordnance rack: **flamethrower** (sets targets burning for 3s at 6 dmg/s — victims see their screen smoulder), **grenade launcher**, **multi-grenade launcher** (3 shells a pull), **napalm lobber** (leaves a burning pool), **arc mortar**, **rocket launcher**, and **plasma lances** — all flown as real projectiles with swept impact detection, so they detonate on the runner they hit, in every mode. **Everyone's ordnance flies visibly on every screen** — you see the enemy's rockets and napalm orbs arc in, not just a tracer line
- Forge wave 2 wrought 15 more frames: a **black-powder musket** (155 dmg, one ball, 3.2s reload), a **longbow** whose arrows fly with true arc ballistics, a **snowball slinger** (lobbed splash that pops white), a **flaregun**, a **slug shotgun**, an 8-shell **duck-gun**, a **blunderbuss**, a lever rifle, a scatter pistol, a jackhammer auto-shotty, battle rifles, a heavy HMG, and big-splash energy casters — muskets and breach-loaders even carry their own reload clocks
- Solo waves: **every kill instantly rolls you to a random loaded weapon** plus a rarity roll
- **LAN Gun Ladder: everyone gets the same weapon at the same score** — kills promote you one tier, and rarity steps up with your tier. **The ladder reshuffles every round** (server-seeded), so tier 12 means something new each match — identically for the whole lobby
- **Knife combat (key 2):** 25 damage flat to the body or head — but a **backstab is an instant kill** (rear 120° cone). Shanks in LAN steal a point: the victim drops one score and one gun tier (never below 0). Kill 30 is a **golden-shank-only** final tier with extra speed and damage — and it grants a **mid-air double jump**
- Knife perks: +5% speed with the shank out, +15% with the golden shank; swap between gun and knife with **1 / 2**; swings are alternating cross-screen slashes with a 0.575s cooldown
- **Rebindable controls:** a full keybind changer lives inside Settings
- **Hold RMB to aim/scope** — one muscle memory, no CTRL accidents
- Buffered jumps, coyote time, and improved air control for fluent movement
- Smarter bot AI: enemies sense walls, steer around cover, slide along obstacles, and un-stick themselves instead of hugging walls
- Daily and weekly challenges for eliminations, solo wave clears, and LAN wins
- Boss enemies every 5 solo waves, including the NEMESIS boss on waves 5, 10, and 15
- Expanded enemy factions: Rift Marauders, Void Brood, Black Iron, Eclipse Drones, Corp Sentinels, Neon Cult, and Blackout Lords
- **Sandbox mode** — a solo playground with no waves and no incoming damage: pick any of the 5 maps, any of the 52 weapons, and spawn any of the 8 hostile types from the box. Press **B** in-game to reopen it and live-swap gear, maps, or monsters
- Animated reloads with weapon drop/cant, magazine movement, pump/bolt action, and staged reload sounds
- Slides are networked — other players see you slide, not just speed past
- Cinematic enemy animation: full-body locomotion, idle breathing, hit reactions, melee slash windups, ranged recoil, brute slam telegraphs, visible hands/claws/feet/gun muzzles
- Full match stats screens with accuracy, headshots, streaks, earnings, and LAN round scoreboard
- Premium map atmosphere: animated reactor/data/crane set pieces, weather particles, pulsing lights, signage, and destructible barrels/crates/data props
- LAN Deathmatch rounds: first player to 30 points wins — **and the 30th point must be a kill you land yourself.** Assists (most recent other damager, claim lapses 5s after your last hit, heals wipe the claim) climb you to 29 — then they stop paying. No assist can ever close out the match
- **Callsign hygiene on LAN:** duplicate names get auto-numbered (`VIPER 2`), and slur/profanity filters scrub leetspeak attempts — scrubbed players become `RIFT-<id>` and get told why
- **Pausing is not an escape hatch on LAN:** your runner stays exactly where you left them — fully visible and fully shootable. The pause menu is a menu, not a hideout
- **Squadmate markers:** in RED v BLUE, teammates carry a glowing green dot above the head. It renders through walls so you always know where your squad is — but it won't shine *through a body*: if another player blocks your line, the dot goes dark
- **Three LAN modes, all in the lobby vote:** after every map ballot, a second ballot picks **FREE FOR ALL** (first player to 30 kills), **RED v BLUE** (auto-balanced squads, no friendly fire, teammates glow in your color — but the win still belongs to one runner: first to 30 kills takes the round), or **KNIFE FIGHT** (blades only, first to **15 stabs** — the 15th kill is necessarily the **golden knife**: at 14 stabs your shank turns golden, and shanks in this mode **never demote** anyone; knife points are sacred). Nobody's vote? FFA by default. Voting is never a coin flip: plurality always wins, and **ties resolve to whichever option got its first vote in earliest**. Only a completely empty map ballot spins the wheel.
- **Sprint and slide in any direction** — strafe-runs and sideways slides are just as fast as forward ones
- **Hold-to-crouch (C)** — move slower and quieter with a tighter spread for precision shots; teammates and enemies see you crouch too
- **Keybind for firing (E)** — hold-to-fire, semi-auto re-arms per press, and knife swings all work without ever touching the mouse; rebindable like everything else (old X saves migrate automatically)
- **5 maps: FORGE, NEXUS, DUSK YARD, COLD STORAGE, and RIFT DOCKS** — map votes always offer a rotating 3 of the 5, each with a generated blueprint picture of its layout
- Brief deathcam/spectate of the killer before respawn
- **Redeploys come in loaded:** respawning instantly tops off your mag and cancels any reload — no pressing R the second you land
- Player bodies break apart into multiple physics pieces on death
- Sniper scope, grenades, slide movement, kill streak banners, gibs, damage-direction indicator, particles and ambient audio

## Anti-cheat: one strike, you're out

The LAN protocol is client-reported (victims report their deaths, shooters report their hits), so the server polices what it can actually see — and it kicks **on the first unambiguous violation**, no warning ladder, no bans:

- **Message flood** — over 240 messages/second from one socket (max ~60/s legit)
- **Trigger-bot cadence** — over 24 hit-reports/second (fastest legit autofire ≈ 15/s)
- **Kill/death spam** — over 7 kills *or* deaths in a 2.5s window from one player. Checking the reporter's death-ring too means a framer can't burn someone else's ring from a fake kill report without hanging themselves first
- **Teleporting** — any position packet that moves you more than 15m from the last one (the first packet after a legit respawn travels free, however late it lands; spawn reports more often than every 0.8s are their own kick)
- **Spawn spam** — more than one spawn report per 0.8s (the only way to smuggle a teleport, so it's capped)
- **Garbage/oversized packets** — malformed position arrays or anything over 4KB

The victim is told `ANTI-CHEAT — <reason>` and the rest of the lobby sees **"ANTI-CHEAT BOOTED &lt;name&gt;"** in the killfeed. Kicked players can just reconnect — the rules only care about live behavior, not grudges. Thresholds sit far above human play, and every one is env-tunable (`AC_MSG_MAX`, `AC_HIT_MAX`, `AC_KILL_MAX`, `AC_TPORT`) so the test suite can exercise them on a hot server.

## Requirements
- **Node.js** (any recent version) — free from https://nodejs.org
- A modern browser (Chrome, Edge, or Firefox recommended)

## How to run

1. Put all the files from this folder somewhere on your PC (keep them together).
2. Open a terminal / command prompt **in this folder** and run:

   ```
   npm install
   node server.js
   ```

   (Windows: you can just double-click `start.bat` instead.
    Mac/Linux: run `./start.sh`.)

3. Open your browser at:

   ```
   http://localhost:8000
   ```

4. Click **DEPLOY SOLO** and play. Your mouse locks automatically — press **Esc** to pause and free it.

## LAN multiplayer

1. Start the server on ONE computer (steps above).
2. Find that computer's local IP address:
   - Windows: `ipconfig` → "IPv4 Address" (e.g. `192.168.1.42`)
   - Mac/Linux: `ifconfig` or `ip a`
3. Everyone else on the same Wi-Fi/network opens:

   ```
   http://192.168.1.42:8000   ← use the host's actual IP
   ```

4. Everyone enters a name (required — the button refuses a blank one).
5. One **LAN MATCH** button — the mode isn't picked in the menu anymore. Every intermission runs two ballots: first the **map** (3 of the 5, with blueprint pictures), then the **mode** (FREE FOR ALL or RED v BLUE). Both take your mouse or number keys (1–3 maps, 1–2 modes), and the countdown timer is honest even across computers with different clocks. In team mode you're auto-placed on the smaller team — teammates can't hurt you, a small chip reminds you whose side you're on, and squads get reshuffled by the next ballot. The win rule never changes: whoever reaches 30 kills first takes the round.

> If others can't connect, allow Node.js through the host's firewall
> (Windows will usually show a pop-up the first time — click "Allow").

## Controls

| Key | Action |
|-----|--------|
| W A S D | Move |
| Mouse | Aim |
| Left click **or E** | Fire / knife swing (hold for full-auto; the E bind is great for touchpads) |
| Right click (hold) | Aim down sights / sniper scope |
| 1 | Gun |
| 2 | Knife — 25 dmg, backstab = instant kill (+5% speed; golden +15%) |
| Shift | Sprint (any direction) |
| Q | Slide (while sprinting, any direction) |
| C | Crouch (hold) — slower, quieter, and steadier aim |
| Space | Jump (buffered + coyote time) |
| G | Frag grenade |
| R | Reload |
| Every kill | Solo: random weapon roll. LAN: advance one shared ladder tier |
| Manual gun swap | Disabled — guns only advance via kills |
| Esc | Pause |

Every key in this table can be rebound in **Settings → KEYBINDS**.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Game page + HUD |
| `game.js` | Game engine (rendering, AI, weapons, netcode) |
| `three.module.js` | Three.js 3D library (bundled, no internet needed) |
| `server.js` | Static file server + LAN multiplayer relay |
| `package.json` | Dependency list (`ws` websocket library) |

Everything runs locally — no internet connection required after `npm install`.

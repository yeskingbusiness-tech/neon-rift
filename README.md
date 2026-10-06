# NEON RIFT: BLACKOUT — Arena FPS

A 15-wave solo survival + LAN deathmatch shooter that runs in your browser.

## Current features
- Saved progression: XP, levels, credits, total kills, solo wave records, LAN wins
- Character skin shop with saved unlocks and LAN-visible selected skins
- 50-weapon arsenal: rifles, SMGs, LMGs, pistols, shotguns, DMRs, snipers, rail/exotic weapons
- Gun Game-style rotation: **every kill instantly rolls you to a random loaded weapon**
- Weapon rarity rolls on each kill: Common, Uncommon, Rare, Epic, and Exotic damage/handling variants
- Daily and weekly challenges for eliminations, solo wave clears, and LAN wins
- Boss enemies every 5 solo waves, including the NEMESIS boss on waves 5, 10, and 15
- Expanded enemy factions: Rift Marauders, Void Brood, Black Iron, Eclipse Drones, Corp Sentinels, Neon Cult, and Blackout Lords
- Execution finishers: press **F** near weakened enemies for a cinematic bonus kill
- Animated reloads with weapon drop/cant, magazine movement, pump/bolt action, and staged reload sounds
- Cinematic enemy animation: full-body locomotion, idle breathing, hit reactions, melee slash windups, ranged recoil, brute slam telegraphs, visible hands/claws/feet/gun muzzles
- Full match stats screens with accuracy, headshots, streaks, earnings, and LAN round scoreboard
- Premium map atmosphere: animated reactor/data/crane set pieces, weather particles, pulsing lights, signage, and destructible barrels/crates/data props
- LAN Deathmatch rounds: first player to 30 kills wins
- Map voting after every round, with multiple maps: FORGE, NEXUS, and DUSK YARD
- Brief deathcam/spectate of the killer before respawn
- Player bodies break apart into multiple physics pieces on death
- Sniper scope, grenades, slide movement, kill streak banners, gibs, damage-direction indicator, particles and ambient audio

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

4. Everyone enters a name and clicks **LAN DEATHMATCH** — you all drop into the same arena.

> If others can't connect, allow Node.js through the host's firewall
> (Windows will usually show a pop-up the first time — click "Allow").

## Controls

| Key | Action |
|-----|--------|
| W A S D | Move |
| Mouse | Aim |
| Left click | Fire |
| Right click | Aim down sights / sniper scope |
| Shift | Sprint |
| C | Slide (while sprinting) |
| Space | Jump |
| G | Frag grenade |
| F | Execute weakened close enemy |
| R | Reload |
| Every kill | Random weapon rotation + rarity roll |
| Manual weapon swap | Disabled — use whatever weapon you roll |
| Esc | Pause |

## Files

| File | Purpose |
|------|---------|
| `index.html` | Game page + HUD |
| `game.js` | Game engine (rendering, AI, weapons, netcode) |
| `three.module.js` | Three.js 3D library (bundled, no internet needed) |
| `server.js` | Static file server + LAN multiplayer relay |
| `package.json` | Dependency list (`ws` websocket library) |

Everything runs locally — no internet connection required after `npm install`.

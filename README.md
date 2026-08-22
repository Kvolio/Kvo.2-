# TIGER

**A first-person Tiger I Ausf. H crew simulator — Operation Zitadelle, July 1943.**

You are the commander of Tiger 101, 3. Kompanie, schwere Panzer-Abteilung 503.

You do not drive this tank and you do not fire its gun. Four other men do those
things, and they are only as good as their training, their nerve and their
wounds allow. Your job is to look, to listen, to work out what you are seeing,
to tell them, and to keep them alive.

---

## Running it

There is no build step. The game is plain ES modules with an import map, and
three.js is vendored into the repository.

```sh
npm start          # serves on http://localhost:8080
```

Any static file server works. `npm test` runs the simulation test suite.

**Browser requirements:** import maps and WebGL 2 — Safari 16.4+, Chrome 89+,
Firefox 108+. It runs the same game on a desktop and on an iPhone or iPad; only
the control surface differs.

---

## Controls

### Keyboard and mouse

| | |
|---|---|
| **W A S D** | walk (on foot, in the briefing tent and the staging area) |
| **Shift** | run · **Ctrl** crouch |
| **Mouse** | look · **E** interact |
| **C** | cycle commander position — buttoned up → hatch open → head out |
| **H** | open / close the cupola hatch |
| **B** | binoculars · **V** look through the gunner's TZF 9b sight |
| **T** | *"Gunner — target, my position"* — hand over whatever you are looking at |
| **F** | fire · **Z** driver forward · **X** stop · **V** reverse |
| **Tab** | command menu · **1–5** jump straight to driver / gunner / loader / radio / emergency |
| **G** | FIRE EXTINGUISHERS · **P** ABANDON TANK |
| **M** | map · **K** crew · **J** damage report · **L** ballistics inspector · **R** radio log |
| **Esc** | pause · **F1** settings · **F3** hide HUD · **F4** performance |

Every binding is rebindable in Settings and persists.

### Touch

The screen is not filled with permanent controls. There is a **look area** on
the right, a **thumbstick that appears wherever your thumb lands** on the left,
five small core buttons, and contextual buttons that appear only when they
apply — `OPEN HATCH`, `TARGET`, `GUNNER SIGHT`, and, when things go wrong,
`EXTINGUISHERS` and `ABANDON`. A tap on the right half designates a target.

The command menu carries every order the keyboard has. There is no simplified
mobile version: same simulation, same vehicles, same campaign, same physics.

---

## What is actually modelled

### One specific tank

Not "a Tiger". **Panzerkampfwagen VI Tiger Ausf. H (Sd.Kfz. 181), Henschel,
Kassel, May/June 1943 production, Fahrgestell-Nr. 250200–250380**, as issued to
s.Pz.Abt. 503 for Zitadelle. That build state is locked and internally
consistent:

- the **early drum cupola** with five vision slits and a flip-up hatch — the
  familiar seven-periscope cast cupola begins at Fgst. 250391 in July 1943,
  after this tank was built
- the **binocular TZF 9b** sight, which is why the mantlet has *two* apertures
- **no Zimmerit** (late August 1943), rubber-tyred interleaved road wheels
  (steel-rimmed from January 1944), Feifel air cleaners, turret smoke
  dischargers, hull S-mine dischargers, and a pistol port rather than a
  Nahverteidigungswaffe

The full research, with the conflicts resolved and the reasons, is in
[`docs/HISTORICAL-RESEARCH.md`](docs/HISTORICAL-RESEARCH.md).

### Armour that is geometry, not a number

There is no armour rating anywhere in this codebase. The Tiger is 35 oriented
plates with real positions, real normals and real thicknesses. Whether a shell
gets through is computed from the shell and the plate — impact velocity at that
range, obliquity taken from the shell's path against the plate normal,
normalisation, ricochet limits, overmatch — with **no random roll anywhere in
the chain, on any difficulty**.

The wartime penetration tables are used only to calibrate a velocity-driven
model, so intermediate ranges and unusual angles fall out of the physics.
Validated in the test suite against the April 1943 Kubinka trials of a captured
Tiger:

- a T-34's BR-350A **cannot** defeat the 80 mm side at 200 m
- the 85 mm BR-365 **can** defeat the 100 mm front at 1000 m

Press **L** in game for the full arithmetic of the last shot that hit you.

### No hit points

The Tiger has no health bar, and neither does anything else. It stops fighting
because something specific broke: the engine, the transmission, both tracks, the
gun, the breech, the traverse drive, the ammunition, or the men. A penetration
is traced through the actual interior and hits what is in the way. Spall is
distributed by cone geometry, which is how crews die in tanks whose armour held.

### Four men, not four stat blocks

Each has a name, a rank, a home town, a personality, a career, wounds, bleeding,
stress and fatigue — and every one of those numbers is read by the gunnery,
loading, driving and repair code. A wounded, frightened, exhausted gunner runs
at a third of his effectiveness and takes nearly three times as long.

There is no stress bar. The crew's tone of voice on the intercom is the readout:
93 dialogue events, each with calm, strained and breaking variants.

### The hatch is a decision

| | field of view | hearing | exposure |
|---|---|---|---|
| Buttoned up | five slits | 380 Hz low-pass, 0.18 directionality | none |
| Hatch open | 120° | 6.5 kHz | partial |
| Head out | 200° | 18 kHz, full directionality | total |

Buttoned up you will hear an engine and not be able to tell where it is. Head
out you can place it by ear — and anything that can see your tank can see your
head.

### Fire, as it actually worked

The Feuerlöschanlage protected the **engine compartment only**. Thermostats at
the fuel pumps trip at 120 °C and fire a 3-litre bottle of CB for seven seconds;
a lamp lights on the driver's panel. There is enough agent for about five
discharges and then it is dry. The agent is toxic. The fighting compartment has
no automatic protection at all — only a hand extinguisher somebody has to reach.

None of it guarantees anything.

### A campaign that remembers

The Tiger's damage carries between missions. A wrecked HL 230 is a depot job and
you fight the next action in a Panzer IV. Abandoned intact behind our lines it
may be recovered; abandoned burning it is a total loss; abandoned in ground the
enemy takes, it is occasionally captured. Dead crewmen are gone for good on
Simulation. Ammunition, fuel and spare parts are finite and resupply
imperfectly — convoys get caught on the road.

Nine missions across the arc of Zitadelle, 5 to 17 July. Not one of them is
"destroy every enemy tank".

---

## Difficulty

Easy, Normal, Hard, Simulation, and a Custom screen with 22 independent knobs.

**No difficulty setting changes armour thickness, projectile penetration, or the
result of any shot.** Those come from the vehicle data and the physics, on every
setting. Difficulty changes how much the game helps you, how good the enemy is,
and how much the campaign forgives.

---

## Graphics

Five presets from Low to Cinematic. Every asset is authored procedurally at load
time — geometry from the researched dimensions, and PBR texture sets generated
onto a canvas — which is why the game is a static site with no downloads and
still has painted steel that behaves differently from cast steel, rubber and
glass.

Quality settings change how the game **looks**. The simulation is identical on
every setting and on every device.

---

## Layout

```
src/
  data/       the historical record: Tiger spec, ammunition, guns, vehicles, missions
  sim/        ballistics, penetration, armour geometry, damage, fire, crew, world
  ai/         enemy and friendly tactical AI — reading the same penetration model
  game/       state machine, commands, repair, recovery, abandonment, radio
  campaign/   roster, logistics, tank record, saves
  render/     renderer, procedural textures, Tiger exterior and interior, effects
  world/      terrain, staging area, briefing tent, props
  ui/         HUD, command menu, touch controls, screens
  audio/      procedurally synthesised sound with hatch-dependent occlusion
docs/         historical research, gauntlet log
tools/        static server, browser smoke tests, inspection gallery
tests/        the simulation test suite
```

`docs/GAUNTLET.md` records what independent critics found wrong with the visuals
and what was done about it, including the findings that were not actioned and
why.

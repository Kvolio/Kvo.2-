# Gauntlet log

The build is not the judge of its own work. Each round captures a fixed set of
inspection shots (`node tools/gallery.mjs`), puts them in front of critics with
**fresh context and no knowledge of the code**, and records what they found and
what was done about it.

Critics are given the images and the requirements only — never a description of
what was supposedly built.

---

## Round 1 — Tiger exterior, interior, and battlefield

Captured at the High preset, 1400×900: 12 exterior angles, 6 interior, 5 player
views, 4 battlefield. Three critics: visual, historical accuracy, immersion.

### Immersion critic — FAIL

Found the most important defect in the project, and found it precisely:

> "The interior is lit by an unoccluded outdoor sky through 0.8-metalness
> materials. **The inside of the tank is brighter than the Russian sky outside
> it.** That single fact destroys the entire premise of the hatch trade-off
> before the player ever presses a key."

| Finding | Status | What was done |
|---|---|---|
| Interior lit by outdoor IBL; inside brighter than outside | **fixed** | Interior materials exempted from the environment map (`envMapIntensity` 0.07). Interior steel dropped from 0.80 metalness to 0.35. Turret lamp cut from 2.4 to 0.85 — a Tiger had one bulb. |
| Hatch-open and gunner-sight views render as blank white | **fixed** | Same cause. |
| Buttoned up reads as "one widescreen TV floating in a void" | **fixed** | The cupola drum was being hidden and the slit faked with a screen-space mask. The drum is now five separate wall segments with laminated glass in the gaps, so the five slits are real openings at real bearings. |
| No crew visible in any interior frame | **fixed** | They were present but blown out white. Visible once the lighting was corrected. |
| Machined metal shows hard vertical "corduroy" stripes | **fixed** | The grain was a 180:3 anisotropic ridge — a moiré generator. Now 90:14. |
| Tank reads as a toy; nothing conveys 57 tonnes | **partly fixed** | Running gear, track loop, welds and shadow all added. Ground deformation, ruts and dust still outstanding. |
| Battlefield is a beige plain, not Kursk | **outstanding** | Phase 5. |
| No atmospheric perspective, so range cannot be estimated | **outstanding** | Phase 5. |
| The floating compass tape is not diegetic | **not actioned** | The brief explicitly asks for a small compass (§118). The user's specification wins over the critic here. |

### Visual critic — FAIL

Judged the capture taken *before* the running-gear rebuild, so its top finding
was already fixed by the time the report landed. The rest was live:

| Finding | Status | What was done |
|---|---|---|
| Road wheels do not exist; suspension is one black slab | **already fixed** | Rubber tyres had been modelled as full-width cylinders, which merged into one mass and hid every wheel. They are rim tori now, over painted dished discs with domed hubs and a bolt circle. |
| Track links detached and flying in mid-air; no closed loop | **fixed** | The sprocket and idler wraps were generated at radii that did not meet the straight runs. The path is now a genuine closed loop, arc-length parameterised. |
| Paint reads as plywood, with a tiling seam | **fixed** | The grain was 34:6 anisotropic — a wood texture. Now isotropic tooth plus low-frequency blotch. |
| No muzzle brake; the 88 ends in a black cap | **fixed** | Real geometry: mount collar, two chambers with open side ports, baffle plates, end cap. |
| Barrel is the same material as the hull | **fixed** | Its own scoured, sooted, more metallic gun-tube material. |
| Smoke dischargers read as holes punched in the turret | **fixed** | Raised on a bracket, with caps. |
| Hull sides are featureless slabs; no weld beads or bolts | **fixed** | Every plate join carries an instanced weld bead run; bolt rows on hatch rims and mounts. |
| Bow MG is a raw sphere with a detached barrel | **fixed** | Seated in a cast collar, barrel on the ball's own axis, with a jacket. |
| No hatches anywhere — "the crew cannot get in" | **fixed** | Driver's and radio operator's hatches now have a proud armoured rim, a bolt ring, a dished lid with a centre boss and grab handle, and a pivot arm. |
| Fenders are zero-thickness paper with gaps to the hull | **fixed** | One continuous mudguard per side with a turned-down lip, mudflaps and support brackets. |
| Vehicle floats; no contact shadow | **fixed** | Not a shadow bug: the morning sun sat at 22° on an azimuth that threw the shadow directly away from the camera, and an over-strong environment map was flattening all directional lighting. `applyEnvironment` was setting `material.envMap`, which overrides `scene.environmentIntensity` and took scene-level control out of the loop. Sun elevations raised and azimuths set to rake across the vehicle. |
| Turret roof overhangs like a lid | **fixed** | Roof let into the shell, with a weld line. |
| Hull side hole showing interior back-faces; orange error face | **outstanding** | Not yet reproduced; to re-check next round. |
| Sprocket tooth ring incomplete | **fixed** | Two full toothed rings with the track running between them. |
| Mantlet is an unmodified capped cylinder | **outstanding** | Phase 2 remainder. |
| No national markings or turret number | **outstanding** | Phase 2 remainder. |
| Engine deck grilles are flat slats with no recess | **outstanding** | Phase 2 remainder. |
| Turret sits too far forward | **not actioned** | Measured from the data: the ring centre is 44.5% of hull length from the front, against ~43% on the real vehicle. The critic's measurement was taken off a wide-angle render. |

### Historical accuracy critic — did not complete

Terminated early on a session limit. To be re-run.

---

## Standing failure conditions

These are checked automatically where they can be, so they cannot regress:

- the Tiger measures 3.705 m over the tracks, 8.45 m with the gun forward and
  3.00 m to the cupola, at **every** level of detail (`tests/model.test.js`)
- the tracks rest on the ground, never floating above it
- a broken track sags and stops rather than scrolling
- lower levels of detail drop fittings, never dimensions

---

# ROUND 2 — the modelling pipeline

The brief changed: gameplay development stops, and the Tiger I becomes a
hero-quality asset judged by independent critics against the user's Kursk
photographs and technical diagram. `docs/TIGER-CONFIGURATION.md` is the
configuration lock every finding is now judged against, and
`docs/reference/MANIFEST.md` is the reference board awaiting the pack.

## The first tool found the worst defect in the project

`tools/ortho.mjs` renders the Tiger in true orthographic projection at an exact
5 mm per pixel and measures it from the geometry rather than from the render.
It found three things on its first run, one of them severe.

| Finding | Severity | Status |
|---|---|---|
| **The entire vehicle was mirrored.** Every asymmetric feature was on the wrong side: the bow machine gun on the driver's side, the driver's visor on the radio operator's, the cupola on the loader's side of the turret roof, the TZF 9b apertures right of the gun and the coaxial port left. | **CRITICAL** | **fixed** |
| Height to the top of the cupola was 3.045 m against 3.00 m — the hatch plate was sitting on top of the drum instead of being counted in it | MAJOR | **fixed** |
| Length reported 8.78 m — a measurement-definition error in the new tool, not a model defect; the published 8.45 m is muzzle to rear plate and excludes the Feifel cylinders | — | tool corrected, and the rear plate moved 20 mm so its outer face lands exactly on the hull's 6.316 m |

### On the mirror

The vehicle frame was authored as "+X is the crew's right" with forward along
+Z and up along +Y. That combination is left-handed, and three.js is
right-handed, so the tank rendered as its own reflection. Nothing in the
simulation was wrong — a mirror is a symmetry, so no thickness, angle or
penetration result changes — but every photograph comparison would have failed
on it, and the damage model would have drawn a shell that killed the loader
passing through the gunner.

It was fixed as the single operation it actually is: one mirror of the vehicle
data in `src/data/tiger1h.js`, and the matching mirror of the geometry in
`buildTiger()`, rather than several hundred hand-flipped literals. The one cost
is that a mirror reverses rotations about Y and Z, so the turret traverse and
the hatch hinges are negated to compensate; rotations about X are unaffected.

**Why no existing check caught it.** The dimensional test measures a bounding
box, and a mirrored tank has the same bounding box. The 53-test suite tested the
simulation, which was correct. Every gallery capture showed it, and neither I
nor three blind critics noticed, because a Tiger is nearly symmetrical and the
eye supplies the rest. It took an orthographic front view with a stated
handedness to make it undeniable. There is now a regression test
(`tests/model.test.js`) asserting both the data and the model put each crewman
on the correct side.

### Outstanding after this batch

| Finding | Severity | Status |
|---|---|---|
| Mantlet reads as a soft grey loaf — the lathe profile's steps are correct but `computeVertexNormals()` averages every step edge away | MAJOR | next: `toCreasedNormals` at ~40° |
| 23 road wheels found on the right side; 8 stations × 3 ranks is 24 | MAJOR | to diagnose |
| Intake louvres are bright machined metal where they should be painted armour | MINOR | pending |
| Exhaust stacks and Feifel drums are featureless black cylinders | MINOR | pending |
| No tow shackles, no Bosch headlight guard, no spare track links on the nose | MINOR | pending |
| Whole vehicle sits in one beige value range, so it reads as a single mass at distance | MAJOR | Phase F |

## Deferred by the new brief

The rye field renders as opaque pastel quads filling the horizon
(`src/world/Props.js:81` sets `alphaTest` on a material with no map). It is a
named absolute failure condition and a one-material fix, but §61 is explicit
that the battlefield is not built around a bad Tiger. It stays logged here until
the vehicles pass.

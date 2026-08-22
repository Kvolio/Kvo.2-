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

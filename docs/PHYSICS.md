# Rain on glass: what actually happens, and how the shader fakes it

This is the checklist the shader was built against. Every point comes from
the five reference photos in `references/` plus the surface-physics of
sessile and sliding drops (contact-angle hysteresis, capillary pinning,
coalescence, and dropwise condensation).

## 1. Two populations of drops

**Sessile drops** (stuck) dominate by count. On a vertical pane a drop stays
pinned until its weight beats the pinning force from contact-angle
hysteresis, `ρ g V ~ γ w (cos θ_r − cos θ_a)`. Small drops never move.
Sizes follow a heavy-tailed distribution: hundreds of sub-millimetre beads
for every large drop (refs 1, 3, 5).

**Runners** (sliding drops) are the few that grew past the critical volume,
usually by an impact or by swallowing neighbours. They are the only thing
that moves, and they are rare compared to the sessile population (ref 4,
ref 1: a handful of tracks across the whole pane).

## 2. Shape imperfections

* Sessile drops are **not circles**. Gravity sags them: the lower half is
  fuller and rounder, the top half is flatter, so the outline is a
  slightly pear-shaped ellipse (ref 2, every drop above ~2 mm).
* Contact lines pin on dirt and scratches, so outlines have low-frequency
  wobble, a few percent of the radius.
* Neighbouring drops that touch **coalesce** instantly into a peanut,
  then relax toward a rounder blob (ref 2, the twin drops centre-left).
* Runners have a **rounded advancing front** at the bottom (large
  advancing angle) and a **tapering tail** at the top (small receding
  angle), i.e. the classic teardrop pointing upward (refs 3, 4).

## 3. Runner motion

* **Stick-slip**: the contact line pins, the drop deforms, then it jumps.
  Velocity is pulsed, not constant.
* **Acceleration**: a runner sweeps up the sessile drops in its path,
  gaining mass and speed as it goes.
* **Lateral wander**: the path meanders because the drop follows surface
  heterogeneity and older trails (ref 1, ref 5 show wavy tracks).
* **Trail**: behind the runner the pane is wet. Capillary instability at
  the receding contact line pinches the film into a chain of small
  droplets (pearling) that stay behind on the track (refs 1, 4, 5).
* A trail is also a **cleared track through condensation**: the runner
  wipes the micro-droplet fog away (refs 1, 5). The fog slowly regrows.

## 4. Condensation ("fog")

Fog on glass is dropwise condensation: millions of micro-droplets below
the resolution of the eye. It scatters light, which reads as a bright,
low-contrast, heavily blurred version of the scene with a fine grainy
texture (ref 5). Large drops scavenge the vapour around them, leaving a
**dry halo** ring around each drop (ref 1: darker rings around beads).

## 5. Optics of a single drop

A drop on glass is a plano-convex lens with a short focal length, so what
you see inside a drop is the scene behind it **inverted and minified**,
covering a wide field of view (ref 2: bright sky at the bottom of every
drop; ref 3: the lamp appears inside nearby drops). Because it focuses
the distant scene, the image inside the drop is **sharper** than the
defocused background around it (refs 2, 3).

Additional cues:

* A **dark rim** where the surface is steep: Fresnel reflection and total
  internal reflection remove the transmitted light near the edge.
* A **thin dark contact line** outlining the drop.
* A **specular highlight** from the dominant light, small and hard.
* A **bright arc** on the edge opposite the light, where refracted light
  concentrates.
* A soft **shadow** on the pane on the side away from the light.

## 6. The camera

The photos are shot focused on the pane, so the world behind it is a
**lens blur**: bright points become discs with a bright rim (ref 3, the
lamp), blade-shaped when the aperture is polygonal. It is not a Gaussian
blur. Glass also carries faint diagonal micro-scratches (ref 3).

## Mapping to shader parameters

| Physics | Parameter(s) |
|---|---|
| sessile population density and size law | `drops.density`, `drops.size`, `drops.layers` |
| new drops hitting the pane | `drops.spawnRate` |
| gravity sag, pinning wobble, coalescence | `drops.irregularity`, `drops.merge` |
| runner count and how often they start | `rain.amount`, `rain.spawnRate` |
| runner speed, pulsing, wander | `rain.speed`, `rain.stickSlip`, `rain.wander` |
| pearling trail and cleared track | `rain.trail`, `rain.trailWidth` |
| condensation, grain, regrowth, dry halo | `fog.amount`, `fog.grain`, `fog.regrow`, `fog.halo`, `fog.tint` |
| inverted lens image, sharpness inside drops | `optics.lensZoom`, `optics.curvature`, `optics.sharpness` |
| dark rim, contact line, highlight, arc, shadow | `optics.rimDark`, `optics.outline`, `optics.highlight`, `optics.sheen`, `optics.shadow`, `optics.light` |
| lens blur and bokeh discs | `blur.radius`, `blur.blades`, `blur.rotation`, `blur.highlightBoost`, `blur.ring` |
| scratches and dust on the pane | `glass.scratches`, `glass.dust` |

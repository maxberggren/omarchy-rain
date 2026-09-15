# Settings gallery

Every image is the same wallpaper and the same moment (t = 20s), rendered at 1080p with only the listed keys changed from the defaults. See the README for the full settings table.

## Preset `default`

`{}`

![default](gallery/default.jpg)

## Preset `drizzle`: few runners, fewer drops, light fog

`{"rain":{"amount":0.25,"spawnRate":0.5},"drops":{"density":0.7},"fog":{"amount":0.35}}`

![drizzle](gallery/drizzle.jpg)

## Preset `downpour`: runners everywhere, fast, three size classes

`{"rain":{"amount":0.95,"spawnRate":2.2,"speed":1.4,"layers":3},"drops":{"density":1.3,"spawnRate":2.5},"fog":{"amount":0.5}}`

![downpour](gallery/downpour.jpg)

## Preset `foggy`: heavy condensation, slow re-fogging

`{"rain":{"amount":0.35},"fog":{"amount":0.9,"grain":0.9,"regrow":0.25}}`

![foggy](gallery/foggy.jpg)

## Preset `dry`: no runners, sparse drops, almost no fog

`{"rain":{"amount":0.0},"drops":{"density":0.8,"spawnRate":0.2},"fog":{"amount":0.2}}`

![dry](gallery/dry.jpg)

## Preset `night`: strong bokeh discs with 7 blades, cool fog

`{"blur":{"highlightBoost":3.0,"ring":0.8,"blades":7},"fog":{"amount":0.5,"tint":[0.7,0.8,1.0]},"post":{"brightness":0.9}}`

![night](gallery/night.jpg)

## `rain.amount` 0.1

`{"rain":{"amount":0.1}}`

![rain-amount-low](gallery/rain-amount-low.jpg)

## `rain.amount` 1.0

`{"rain":{"amount":1.0}}`

![rain-amount-high](gallery/rain-amount-high.jpg)

## `rain.size` 0.6

`{"rain":{"size":0.6}}`

![rain-size-small](gallery/rain-size-small.jpg)

## `rain.size` 1.8

`{"rain":{"size":1.8}}`

![rain-size-big](gallery/rain-size-big.jpg)

## `rain.trailWidth` 0.5

`{"rain":{"trailWidth":0.5}}`

![rain-trailwidth-thin](gallery/rain-trailwidth-thin.jpg)

## `rain.trailWidth` 2.0

`{"rain":{"trailWidth":2.0}}`

![rain-trailwidth-wide](gallery/rain-trailwidth-wide.jpg)

## `rain.wander` 0

`{"rain":{"wander":0}}`

![rain-wander-none](gallery/rain-wander-none.jpg)

## `rain.wander` 3

`{"rain":{"wander":3}}`

![rain-wander-wild](gallery/rain-wander-wild.jpg)

## `drops.density` 0.4

`{"drops":{"density":0.4}}`

![drops-density-low](gallery/drops-density-low.jpg)

## `drops.density` 2.2

`{"drops":{"density":2.2}}`

![drops-density-high](gallery/drops-density-high.jpg)

## `drops.size` 0.6

`{"drops":{"size":0.6}}`

![drops-size-small](gallery/drops-size-small.jpg)

## `drops.size` 1.6

`{"drops":{"size":1.6}}`

![drops-size-big](gallery/drops-size-big.jpg)

## `drops.irregularity` 0: perfect ovals

`{"drops":{"irregularity":0}}`

![drops-irregular-none](gallery/drops-irregular-none.jpg)

## `drops.irregularity` 2

`{"drops":{"irregularity":2}}`

![drops-irregular-high](gallery/drops-irregular-high.jpg)

## `fog.amount` 0

`{"fog":{"amount":0}}`

![fog-none](gallery/fog-none.jpg)

## `fog.amount` 0.8

`{"fog":{"amount":0.8}}`

![fog-heavy](gallery/fog-heavy.jpg)

## `fog.lift` 0.8: milky condensation

`{"fog":{"amount":0.6,"lift":0.8}}`

![fog-lift](gallery/fog-lift.jpg)

## `fog.grain` 0

`{"fog":{"amount":0.6,"grain":0}}`

![fog-grain-none](gallery/fog-grain-none.jpg)

## `optics.lensZoom` 1: barely refracting

`{"optics":{"lensZoom":1,"field":0}}`

![lens-flat](gallery/lens-flat.jpg)

## `optics.lensZoom` 14: wide inverted field

`{"optics":{"lensZoom":14}}`

![lens-wide](gallery/lens-wide.jpg)

## `optics.sharpness` 0: drops show the blurred scene

`{"optics":{"sharpness":0}}`

![sharp-none](gallery/sharp-none.jpg)

## `optics.sharpness` 1

`{"optics":{"sharpness":1}}`

![sharp-full](gallery/sharp-full.jpg)

## `optics.rimDark` 0 and `optics.outline` 0

`{"optics":{"rimDark":0,"outline":0}}`

![rim-none](gallery/rim-none.jpg)

## `optics.rimDark` 1 and `optics.outline` 1

`{"optics":{"rimDark":1,"outline":1}}`

![rim-strong](gallery/rim-strong.jpg)

## `optics.highlight` 0

`{"optics":{"highlight":0}}`

![highlight-none](gallery/highlight-none.jpg)

## `optics.highlight` 2.5

`{"optics":{"highlight":2.5}}`

![highlight-strong](gallery/highlight-strong.jpg)

## `blur.radius` 0: sharp wallpaper

`{"blur":{"radius":0}}`

![blur-none](gallery/blur-none.jpg)

## `blur.radius` 60

`{"blur":{"radius":60}}`

![blur-large](gallery/blur-large.jpg)

## `blur.blades` 6 with `blur.highlightBoost` 10

`{"blur":{"blades":6,"highlightBoost":10,"threshold":0.4}}`

![blur-blades](gallery/blur-blades.jpg)

## `glass.vignette` 0.9

`{"glass":{"vignette":0.9}}`

![vignette-strong](gallery/vignette-strong.jpg)

## `post.filmic` 0, `post.saturation` 1.2

`{"post":{"filmic":0,"saturation":1.2}}`

![tone-flat](gallery/tone-flat.jpg)

## `post.saturation` 0.15

`{"post":{"saturation":0.15}}`

![tone-mono](gallery/tone-mono.jpg)


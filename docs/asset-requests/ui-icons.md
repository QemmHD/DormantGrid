# UI icons (ChatGPT can make these)

Format: PNG with a TRANSPARENT background,
256×256 or larger (it is shrunk to 128).
Square. One object per icon.
Drop into: `assets/incoming/ui-icons/`
Name: `icon.<item>_01.png`. The item part matches
the in-game item, e.g. `tool.crowbar` →
`icon.crowbar_01.png`.

## Batch prompt (use for every batch)
```
Game inventory icons, one per image,
256x256, transparent background.
Stylized, chunky, bevelled shapes, thick soft
outline, 3/4 view, light from top-left.
Muted colors, readable at tiny size on a phone.
No text, no letters, no frame, no shadow plate.
Make these items: [LIST]
```

## Batch 1: materials
icon.scrap_01 (scrap metal), icon.timber_01
(planks), icon.brick_01 (brick chunk),
icon.glass_01 (glass shards), icon.cloth_01
(folded cloth), icon.wiring_01 (wire coil),
icon.plastic_01 (plastic bits), icon.chemicals_01
(jerrycan), icon.organic_01 (fiber bundle)

## Batch 2: tools
icon.crowbar_01, icon.axe_01, icon.pickaxe_01,
icon.saw_01, icon.torch_01 (cutting torch),
icon.hammer_01, icon.shovel_01, icon.wateringcan_01

## Batch 3: weapons and ammo
icon.pipe_01 (lead pipe), icon.machete_01,
icon.spear_01, icon.bow_01, icon.crossbow_01,
icon.nailgun_01, icon.rifle_scrap_01,
icon.arrow_01, icon.bolt_01, icon.nails_01,
icon.round_01

## Batch 4: food and medicine
icon.can_beans_01, icon.water_bottle_01,
icon.water_dirty_01, icon.bread_01, icon.stew_01,
icon.egg_01, icon.meat_raw_01, icon.meat_cooked_01,
icon.carrot_01, icon.potato_01, icon.tomato_01,
icon.bandage_01, icon.splint_01, icon.antiseptic_01,
icon.pills_01, icon.medkit_01

## Batch 5: building and stations
icon.foundation_01, icon.wall_01, icon.doorway_01,
icon.window_01, icon.floor_01, icon.roof_01,
icon.stairs_01, icon.fence_01, icon.storage_01,
icon.bed_01, icon.workbench_01, icon.campfire_01,
icon.kitchen_01, icon.farmplot_01, icon.turret_01,
icon.alarm_01, icon.spiketrap_01

## Batch 6: HUD symbols (flat, single color, white
on transparent)
icon.hud_hunger_01, icon.hud_thirst_01,
icon.hud_stamina_01, icon.hud_sleep_01,
icon.hud_health_01, icon.hud_bleed_01,
icon.hud_fracture_01, icon.hud_sick_01,
icon.hud_map_01, icon.hud_build_01,
icon.hud_inventory_01, icon.hud_craft_01
Add to the prompt: "flat white glyph, no shading".

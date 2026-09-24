<!-- Product entry, local startup and links to detailed gameplay and verification guides. -->
# Rust Alarm

An open-source remake of EA’s Command & Conquer: Red Alert 2 (RA2).

开源重制 EA’s Command & Conquer: Red Alert 2。

An unofficial fan project with no affiliation with or endorsement from EA. 非官方项目，与 EA 无隶属或背书关系。

An independent browser RTS with original artwork prepared on the player's device.
Choose **Skirmish / 遭遇战** to fight computer opponents, or **Bootcamp / 新兵训练营**
to freely build and recruit supported units on an asset training field.

Created by [Victor Zhou](https://zzn.im) on 2026-09-04 using
ChatGPT 6 Astra, with the original result at [v0.1.0](https://github.com/xinbenlv/rustalarm/commit/3b9e9eaa2aa3b13db1f1bb1daca0f833d48986bf).

## Prepare local originals after cloning

Git does not run hooks supplied by a newly cloned repository. On the first clone,
run `sh scripts/prepare-local-assets.sh` after checkout. The script creates the
ignored `_3p/` directory and asks before any download. A yes answer installs the
Node dependencies, verifies the installer from Internet Archive, unpacks it under
`_3p/`, and converts the assets into ignored `public/assets/` and `public/maps/`.
The Windows installer never runs. A no answer leaves browser preparation available
after `npm ci`. Run `npm run assets:setup` later to prepare assets without the prompt.

To receive the question during **future** clones, use the Git template from an
existing checkout:

```sh
git -c init.templateDir=/absolute/path/to/rustalarm/.git-template clone git@github.com:xinbenlv/rustalarm.git
```

Git copies the template hook before checkout. The hook prompts only in an
interactive terminal. The regular `npm run repo:hooks` command also enables the
same prompt on later branch checkouts in an existing clone. The `_3p/` installer
and converted assets persist across local starts, so `npm run dev` reuses them.

## Play

[Play the published version](https://ra2.apps.zzn.im/).
Bootcamp in this checkout is **v0.5.0**; a local implementation does not update that site.

```sh
npm ci
npm run dev
```

Open the printed localhost URL. Before choosing a mode, prepare missing originals using
the browser's consent/download or local installer import flow. Files are verified and converted locally; the published app never hosts or uploads original media.

Local dev reuses complete converted `public/assets/` and `public/maps/`
from this checkout or the shared main checkout, across worktrees. The
terminal prints `Reusing prepared originals`: no installer download, parsing or
conversion is needed. Image/audio loading still occurs. Set
`RA2_PUBLIC_DIR=/absolute/path/to/public` to select another prepared directory, or
`RA2_DEV_ASSETS=browser` to test browser preparation. Restart Vite after changes.
Incomplete disk assets fall back to browser preparation. Production builds and
preview still use browser storage and never copy original media into `dist/`.

When conversion is needed, dev/preview offers a detected local installer. Set
`RA2_LOCAL_INSTALLER=/path/to/Red-Alert-2-Multiplayer.exe` for another location.
This skips the archive download only; the browser still verifies and converts it.

- Skirmish retains countries, teams, native maps, mining, production and combat.
- Original menu video, Fira typography, lobby and sidebars; a 3-second entry splash.
- ESC opens options/language controls. Native bottom icons command groups and
  waypoints; hovering reveals unit/building names in both 2D and 3D.
- Bootcamp defaults to traditional Canvas 2D on **every** entry. Open the lower-left
  **Debug Panel** and select **2D / 3D** to change the renderer in the same match.
- Bootcamp has immediate production and replenished finite credits. It unlocks the
  12 verified model types across factions. Bounds, occupancy and land/sea/air rules
  still apply. Opponents remain damageable passive targets; training does not end
  automatically when bases or armies are destroyed.
- Bootcamp defaults to **Asset Training Field / 素材训练场**, built from existing
  grass, water, rock, ramp, tree and road assets. 2D and 3D show the same map.
  3D adds worn roads, wet sand/shallow water and mineral stones that deplete with mining.
- The 3D view renders terrain and actors with authored GLBs. Selection,
  commands, IDs, positions, health, teams, resources and time survive switching.
  Failed model loading or WebGL context loss returns to 2D.
- Map editor, portable `.ra2map` sharing and original `.map` imports remain available.
- Players can save and load Skirmish or Bootcamp, including imported maps.
  The pause menu manages local saves and `.rustalarm-save` backups. See [save controls](docs/save-games.md).

## Models and limits

The UI and engine enforce the same [12-model catalog](src/bootcamp/README.md).
Environment assets and unfinished references are not recruitable.

3D supports isometric, perspective and top views: Alt + left drag orbits, middle
drag pans, and the wheel zooms. See [rendering limits](src/bootcamp/README.md) for
model coverage, animation gaps and team colors.

## Build and verify

```sh
npm test
npm run build
npm run repo:check
node --import tsx scripts/check-source-only.ts --build
npm run preview
```

For subpath hosting, set `RA2_BASE_PATH=/your-path/` on both build and preview.
Authored GLBs are emitted at content-hashed `app/models` paths and loaded on demand.
Original `/assets` and `/maps` remain browser-private; Vite public copying stays off.
The footer identifies the local commit; changes do not deploy the site.

[UI acceptance](docs/menus-verification.md) · [Bootcamp acceptance](docs/bootcamp-verification.md) · [战斗与支援代码比对](docs/combat-fidelity-comparison.md) · [Detailed game/asset/editor guide](docs/game-guide.md) ·
[Source map](src/README.md) · [Browser tests](scripts/README.md) · [Local model tools](tools/README.md) ·
[Earlier verification](docs/verification.md) · [Asset workflow](.agents/skills/ra2-hd-blender/SKILL.md)

Original-media screenshots stay local under ignored `.cache/`; never published.

## Rights and contact

Independent fan project, with no affiliation, sponsorship or endorsement from EA,
Westwood, their licensors, OpenAI or ChatGPT. Original game trademarks/media belong
to EA and their respective rights holders; OpenAI/ChatGPT marks belong to their
owners. No infringement is intended, no ownership of originals is claimed, and
this project grants no third-party media license. Rights/takedown contact:
[hi@zzn.im](mailto:hi@zzn.im).

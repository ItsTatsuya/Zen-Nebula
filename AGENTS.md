# AGENTS.md

Guidance for AI agents working in this repository.

## Two copies of the project (read this first)

This folder (`D:\Work\Zen-Nebula`) is a **local copy of the project kept for git tracking**. It is not the copy Zen Browser loads.

The live copy, used to preview the theme in Zen, is:

```
C:\Users\Tatsuya\AppData\Roaming\zen\Profiles\851uy87e.Default (release)\chrome\sine-mods\Nebula
```

Rules:

- To see a change in the real browser, it must be made in the **live folder** above.
- Whenever you make a change in the live folder, **make the identical change in this local copy**, so git tracks it. Keep the two in sync.
- Commit only from this local copy. Do not initialise git in the live folder.
- Quote the live path when using it in a shell; it contains spaces and parentheses.
- Zen needs a restart to reload `js/nebula.uc.js` and chrome styles after changes (CSS-only edits can often be checked via Zen's live editing).

## What this project is

**Nebula Nova** (v3.6.0, by ItsTatsuya) is a glass-style theme for [Zen Browser](https://zen-browser.app/), forked from [JustADumbPrsn/Zen-Nebula](https://github.com/JustADumbPrsn/Zen-Nebula). It is installed and configured through the [Sine](https://github.com/CosmoCreeper/Sine) mod manager. The Sine mod ID and on-disk folder remain `Nebula` so existing installs and saved preferences keep working. Do not rename them.

## Layout

| Path                       | Purpose                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `theme.json`               | Sine mod manifest (id, name, version, entry styles/scripts)                                 |
| `preferences.json`         | Source of truth for settings UI: labels, types, defaults, choices                           |
| `userChrome.css`           | Imports `nebula/chrome.css` (browser chrome)                                                |
| `userContent.css`          | Imports `nebula/content.css` (internal pages)                                               |
| `nebula/chrome.css`        | Imports each module in `nebula/modules/`, then `config.css`, then `reduced-motion.css` last |
| `nebula/config.css`        | CSS variable tokens and fallback defaults                                                   |
| `nebula/modules/*.css`     | Per-area chrome styles (sidebar, urlbar, tabs, toolbar, miniplayer, etc.)                   |
| `nebula/content/*.css`     | Styles for content pages (Settings, Mods page, PDF viewer, transparent settings)            |
| `js/nebula.uc.js`          | Core script; reads `preferences.json` at startup and applies prefs at runtime               |
| `scripts/check-config.mjs` | Automated audit of preferences, defaults, consumers, and CSS variables                      |
| `docs/configuration.md`    | Configuration standard and full preference audit table                                      |
| `template/mods.json`       | Sine template registering the mod                                                           |
| `.browsercfg.json`         | Sine bootloader/import config                                                               |

## Conventions

- Preference keys must stay stable; installed users retain saved choices.
- Adding an option means: add it to `preferences.json`, add a consumer (CSS and/or `js/nebula.uc.js`), and update the audit table in `docs/configuration.md`. Follow the standard in that file (grouping, sentence-style labels, explicit defaults, paired light/dark colors, CSS lengths for sizes).
- New modules must be imported from `nebula/chrome.css`; keep `reduced-motion.css` imported last so accessibility overrides win.
- Version bumps touch `package.json`, `theme.json` and `template/mods.json` (`version`, `updatedAt`), `README.md`, `docs/configuration.md`, and the header in `js/nebula.uc.js`.
- Match the surrounding code style. Formatting is Prettier (`.prettierrc.json`); CSS is linted by Stylelint (`stylelint.config.mjs`).

## Commands

Package manager is Bun (`bun.lock`).

```
bun install              # install dev dependencies (also sets up husky)
bun run check:config     # audit preferences vs. code and docs
bun run lint             # prettier --check + stylelint
bun run lint:fix         # prettier --write + stylelint --fix
```

The pre-commit hook runs `bun lint`. Run `check:config` and `lint` before committing.

## Verification

Linting and the config audit cannot confirm visual results. GPU blur, native widget appearance, and animations need a live check in Zen using the live folder above.

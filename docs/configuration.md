# Nebula Nova configuration

Nebula Nova 3.5.0 is maintained by ItsTatsuya.

`preferences.json` is the source for labels, types, defaults and choices. The core script reads that same file at startup. `nebula/config.css` defines the visual tokens and fallback values for CSS-only use. Keep preference keys stable so installed users retain their choices.

## Standard

- Use Appearance, Behavior and Optional features as the main groups, with an emoji on each group and subsection heading for easy scanning.
- Use one separator per related set of controls, sentence-style labels, explicit defaults and `12px 0` control margins.
- Dropdown values remain stable; numeric choices appear in numeric order.
- Use paired light/dark colors, CSS lengths for sizes, and percentages for saturation/grayscale.
- Add a consumer and update the audit whenever adding an option. Run `bun run check:config` and `bun run lint`.
- Settings corners follow [concentric radius geometry](https://interactively.info/article/perfect-nested-rounded-corners): keep the configured radius on cards, and add the section's `16px` padding plus `1px` border to its outer radius. Subtract the marketplace grid's extra `2px` inset from its card radius. Native joined rows subtract their border width; previews subtract their actual inset, clamped at zero. Independent controls, dialogs and surfaces with unequal or wide insets keep their own radius. Preserve native pane widths and spacing.

## Behavior and limits

- Custom fonts must be installed. Presets include system fallbacks. An empty or invalid custom family falls back to system UI.
- Invalid CSS inputs use the documented default without erasing the saved input. Changes to visual string preferences are also applied to Settings and the Bookmarks/History documents.
- Saved choices take precedence over startup defaults. The window-control placement preference belongs to Zen and keeps its native default.
- Website tint applies to browsers Zen marks transparent. Nebula does not enable transparent browsing itself.
- Pinned extension styling requires placing extensions beside the address bar as described in the README.
- Media artwork requires an active media session exposing artwork; the artwork style takes effect when media backgrounds are enabled.
- Bookmarks visibility options operate when the bookmarks toolbar is enabled in Zen. Compact mode with its toolbar hidden retains Zen’s native behavior to avoid competing hover panels.
- Reduced-motion mode takes precedence over animation options.

## Preference audit

All 47 fields have explicit typed defaults and consumers. The automated audit checks dropdown variants, metadata, saved-value preservation, runtime defaults and CSS variable registration. GPU blur and native widget appearance still require a live Zen visual check.

| Group             | Preference                                         | Default                        | Consumer                                                                                             |
| ----------------- | -------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Appearance        | `nebula-ui-font`                                   | `"browser"`                    | `nebula/content/better-pdf.css`, `nebula/modules/ui-font.css`, `js/nebula.uc.js`                     |
| Appearance        | `nebula-ui-font-weight`                            | `"400"`                        | `nebula/modules/ui-font.css`, `js/nebula.uc.js`                                                      |
| Appearance        | `nebula-ui-font-custom-enable`                     | `false`                        | `nebula/modules/ui-font.css`, `js/nebula.uc.js`                                                      |
| Appearance        | `nebula-ui-font-custom`                            | `""`                           | `nebula/modules/ui-font.css`, `js/nebula.uc.js`                                                      |
| Appearance        | `var-nebula-glass-blur`                            | `"32px"`                       | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-glass-saturation`                      | `"140%"`                       | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-color-glass-light`                     | `"rgba(255, 255, 255, 0.4)"`   | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-color-glass-dark`                      | `"rgba(0, 0, 0, 0.4)"`         | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-ui-tint-light`                         | `"rgba(255,255,255,0.2)"`      | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-ui-tint-dark`                          | `"rgba(0,0,0,0.2)"`            | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-website-tint-light`                    | `"rgba(255,255,255,0)"`        | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-website-tint-dark`                     | `"rgba(0,0,0,0)"`              | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-tabs-minimum-light`                    | `"rgba(255, 255, 255, 0.1)"`   | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-tabs-minimum-dark`                     | `"rgba(0, 0, 0, 0.2)"`         | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-tabs-default-light`                    | `"rgba(255,255,255,0.25)"`     | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-tabs-default-dark`                     | `"rgba(0,0,0,0.35)"`           | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-tabs-hover-light`                      | `"rgba(255,255,255,0.35)"`     | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-tabs-hover-dark`                       | `"rgba(0,0,0,0.45)"`           | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-tabs-selected-light`                   | `"rgba(255,255,255,0.45)"`     | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-tabs-selected-dark`                    | `"rgba(0,0,0,0.55)"`           | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-color-shadow-light`                    | `"rgba(255, 255, 255, 0.055)"` | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-color-shadow-dark`                     | `"rgba(0, 0, 0, 0.55)"`        | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-border-radius`                         | `"13px"`                       | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-essentials-width`                      | `"60px"`                       | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `var-nebula-workspace-grayscale`                   | `"100%"`                       | `nebula/config.css`, `js/nebula.uc.js`                                                               |
| Appearance        | `nebula-macos-style-buttons`                       | `false`                        | `nebula/modules/topbar-buttons.css`                                                                  |
| Appearance        | `zen.view.experimental-force-window-controls-left` | `false`                        | `nebula/modules/topbar-buttons.css`                                                                  |
| Appearance        | `nebula-tabs-no-shadow`                            | `false`                        | `nebula/modules/general-ui.css`                                                                      |
| Appearance        | `nebula-nogaps-mod`                                | `false`                        | `nebula/modules/general-ui.css`                                                                      |
| Behavior          | `nebula-tab-switch-animation`                      | `1`                            | `nebula/modules/tab-animations.css`                                                                  |
| Behavior          | `nebula-tab-loading-animation`                     | `1`                            | `nebula/modules/tab-animations.css`                                                                  |
| Behavior          | `nebula-urlbar-animation`                          | `1`                            | `nebula/modules/urlbar.css`                                                                          |
| Behavior          | `nebula-disable-menu-animations`                   | `false`                        | `nebula/modules/general-ui.css`                                                                      |
| Behavior          | `nebula-glow-gradient`                             | `1`                            | `nebula/modules/pinned-extensions.css`, `nebula/modules/tab-styles.css`, `nebula/modules/urlbar.css` |
| Behavior          | `nebula-active-tab-glow`                           | `0`                            | `nebula/modules/tab-styles.css`, `js/nebula.uc.js`                                                   |
| Behavior          | `nebula-bookmarks-autohide`                        | `0`                            | `nebula/modules/sidebar.css`                                                                         |
| Behavior          | `nebula-workspace-style`                           | `1`                            | `nebula/modules/workspace-buttons.css`                                                               |
| Behavior          | `nebula-remove-workspace-indicator`                | `false`                        | `nebula/modules/workspace-buttons.css`                                                               |
| Behavior          | `nebula-default-sound-style`                       | `1`                            | `nebula/modules/sound-icon.css`                                                                      |
| Behavior          | `nebula-media-background-enabled`                  | `false`                        | `js/nebula.uc.js`                                                                                    |
| Behavior          | `nebula-media-background-style`                    | `"blur"`                       | `nebula/modules/miniplayer.css`, `js/nebula.uc.js`                                                   |
| Optional features | `nebula-disable-container-styling`                 | `false`                        | `nebula/modules/tab-styles.css`                                                                      |
| Optional features | `nebula-pinned-tabs-bg`                            | `false`                        | `nebula/modules/tab-folders.css`, `nebula/modules/tab-styles.css`                                    |
| Optional features | `nebula-essentials-gray-icons`                     | `false`                        | `nebula/modules/essentials.css`                                                                      |
| Optional features | `nebula-folder-styling`                            | `false`                        | `nebula/modules/tab-folders.css`                                                                     |
| Optional features | `nebula-turn-off-zen-menu-icon`                    | `false`                        | `nebula/modules/topbar-buttons.css`                                                                  |
| Optional features | `nebula-pinned-extensions-mod`                     | `false`                        | `nebula/modules/pinned-extensions.css`                                                               |

## Transparent sidebar reference

The transparent-browser path uses the background-layer placement illustrated by [Arc 2.0](https://github.com/YashjitPal/Arc-2.0/blob/main/modules/chrome/sidebar.css), with Nebula’s blur, tint and radius. Zen’s native SVG underlay is confined to the visible background rather than the toolbox padding. The flag-off titlebar blur is retained.

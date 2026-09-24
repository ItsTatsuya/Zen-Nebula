// ==UserScript==
// @name           nebula.uc.js
// @description    Central engine for Nebula Nova with all modules
// @author         JustAdumbPrsn
// @version        v3.4
// @include        main
// @grant          none
// ==/UserScript==

(function () {
  "use strict";

  if (window.Nebula) {
    try {
      window.Nebula.destroy();
    } catch {}
  }

  window.Nebula = {
    _modules: [],
    _initialized: false,

    logger: {
      _prefix: "[Nebula]",
      log(msg) {
        console.log(`${this._prefix} ${msg}`);
      },
      warn(msg) {
        console.warn(`${this._prefix} ${msg}`);
      },
      error(msg) {
        console.error(`${this._prefix} ${msg}`);
      },
    },

    runOnLoad(callback) {
      if (document.readyState === "loading") {
        this._loadHandler = callback;
        document.addEventListener("DOMContentLoaded", callback, { once: true });
      } else callback();
    },

    register(ModuleClass) {
      const name = ModuleClass?.name || "UnnamedModule";
      if (!ModuleClass) {
        this.logger.warn(
          `Module "${name}" is not defined, skipping registration.`,
        );
        return;
      }
      if (this._modules.find((m) => m._name === name)) {
        this.logger.warn(`Module "${name}" already registered.`);
        return;
      }

      let instance;
      try {
        instance = new ModuleClass();
      } catch (err) {
        this.logger.error(`Module "${name}" failed to construct:\n${err}`);
        return; // skip this module, keep others running
      }

      instance._name = name;
      this._modules.push(instance);

      if (this._initialized && typeof instance.init === "function") {
        try {
          instance
            .init()
            ?.catch?.((err) =>
              this.logger.error(`Module "${name}" failed to init:\n${err}`),
            );
        } catch (err) {
          this.logger.error(`Module "${name}" failed to init:\n${err}`);
        }
      }
    },

    getModule(name) {
      return this._modules.find((m) => m._name === name);
    },

    init() {
      this.logger.log("⏳ Initializing core...");
      this._initialized = true;
      this.runOnLoad(() => {
        this._modules.forEach((m) => {
          try {
            m.init?.()?.catch?.((err) =>
              this.logger.error(`Module "${m._name}" failed to init:\n${err}`),
            );
          } catch (err) {
            this.logger.error(`Module "${m._name}" failed to init:\n${err}`);
          }
        });
      });
      this._unloadHandler = () => this.destroy();
      window.addEventListener("unload", this._unloadHandler, { once: true });
    },

    destroy() {
      if (this._loadHandler) {
        document.removeEventListener("DOMContentLoaded", this._loadHandler);
        this._loadHandler = null;
      }
      if (this._unloadHandler) {
        window.removeEventListener("unload", this._unloadHandler);
        this._unloadHandler = null;
      }
      this._modules.forEach((m) => {
        try {
          m.destroy?.();
        } catch (err) {
          this.logger.error(`Module "${m._name}" failed to destroy:\n${err}`);
        }
      });
      this.logger.log("🧹 All modules destroyed.");
      if (window.Nebula === this) delete window.Nebula;
    },

    debug: {
      listModules() {
        return Nebula._modules.map((m) => m._name || "Unnamed");
      },
      destroyModule(name) {
        const mod = Nebula._modules.find((m) => m._name === name);
        try {
          mod?.destroy?.();
        } catch (err) {
          Nebula.logger.error(`Module "${name}" failed to destroy:\n${err}`);
        }
      },
      reload() {
        Nebula.destroy();
        location.reload();
      },
    },
  };

  // ========== NebulaPolyfillModule ==========
  class NebulaPolyfillModule {
    constructor() {
      this.root = document.documentElement;
      this.compactObserver = null;
      this.modeObserver = null;
      this.settingsGlassObserver = null;
      this.settingsGlassDocument = null;
      this.settingsGlass = null;
      this.settingsGlassFrame = 0;
      this._faviconTimeout = null;
      this._faviconRequest = 0;
      this._gBrowserWaitTimer = null;
      this._gBrowserWaitResolve = null;
      this._prefs = null;
      this._destroyed = false;
      this._prefObserver = {
        observe: (_subject, _topic, data) => {
          if (data === "nebula-active-tab-glow") this.updateFaviconColor();
          if (
            data === "var-nebula-glass-blur" ||
            data === "var-nebula-glass-saturation"
          ) {
            this.updateSettingsGlass();
          }
        },
      };
      this._pageProgressListener = {
        onLocationChange: (browser, webProgress, _request, location) => {
          if (webProgress?.isTopLevel && browser === gBrowser.selectedBrowser) {
            this.updateSelectedPage(location?.spec);
          }
        },
      };

      this.updateFaviconColor = this.updateFaviconColor.bind(this);
      this.updateSelectedPage = this.updateSelectedPage.bind(this);
      this._onTabSelect = () => this.updateSelectedPage();
      this._onSettingsLoad = () => this.updateSettingsGlass();
      this._onSettingsResize = () => this.positionSettingsGlass();
    }

    async init() {
      this._destroyed = false;

      // Wait until gBrowser is available
      if (!window.gBrowser?.tabContainer) {
        const ready = await new Promise((resolve) => {
          this._gBrowserWaitResolve = resolve;
          const check = () => {
            if (this._destroyed) {
              this._gBrowserWaitTimer = null;
              this._gBrowserWaitResolve = null;
              resolve(false);
            } else if (window.gBrowser?.tabContainer) {
              this._gBrowserWaitTimer = null;
              this._gBrowserWaitResolve = null;
              resolve(true);
            } else {
              this._gBrowserWaitTimer = setTimeout(check, 50);
            }
          };
          check();
        });
        if (!ready || this._destroyed) return;
      }

      // Supply Nebula's own defaults before Sine's settings are opened.
      this.ensureRuntimePrefs();

      // Compact mode is a root attribute. Observe only that attribute instead
      // of querying the whole browser for every DOM mutation.
      const updateCompactMode = () => {
        this.root.toggleAttribute(
          "nebula-compact-mode",
          this.root.getAttribute("zen-compact-mode") === "true",
        );
        this.updateSettingsGlass();
      };
      this.compactObserver = new MutationObserver(updateCompactMode);
      this.compactObserver.observe(this.root, {
        attributes: true,
        attributeFilter: ["zen-compact-mode"],
      });
      updateCompactMode();

      // Toolbar mode detection
      this.modeObserver = new MutationObserver(() => this.updateToolbarModes());
      this.modeObserver.observe(this.root, {
        attributes: true,
        attributeFilter: ["zen-sidebar-expanded", "zen-single-toolbar"],
      });
      this.updateToolbarModes();

      // Settings lives in a separate document. Its own backdrop layer can
      // blur Settings controls beneath the floating chrome sidebar.
      const toolbox = document.getElementById("navigator-toolbox");
      if (toolbox) {
        this.settingsGlassObserver = new MutationObserver(() =>
          this.animateSettingsGlass(),
        );
        this.settingsGlassObserver.observe(toolbox, {
          attributes: true,
          attributeFilter: [
            "zen-has-hover",
            "zen-user-show",
            "zen-has-empty-tab",
            "flash-popup",
            "has-popup-menu",
            "movingtab",
            "zen-compact-mode-active",
          ],
        });
      }
      gBrowser.addEventListener("load", this._onSettingsLoad, true);
      window.addEventListener("resize", this._onSettingsResize);

      // Favicon color detection
      try {
        this._prefs = this._services().prefs;
        this._prefs.addObserver(
          "nebula-active-tab-glow",
          this._prefObserver,
          false,
        );
        this._prefs.addObserver("var-nebula-glass-blur", this._prefObserver);
        this._prefs.addObserver(
          "var-nebula-glass-saturation",
          this._prefObserver,
        );
      } catch (err) {
        Nebula.logger.warn(
          `⚠️ [Polyfill] Could not observe favicon glow preference: ${err}`,
        );
      }

      gBrowser.tabContainer.addEventListener(
        "TabSelect",
        this.updateFaviconColor,
      );
      gBrowser.tabContainer.addEventListener(
        "TabAttrModified",
        this.updateFaviconColor,
      );
      gBrowser.tabContainer.addEventListener("TabSelect", this._onTabSelect);
      gBrowser.addTabsProgressListener(this._pageProgressListener);

      // Initial run
      this.updateFaviconColor();
      this.updateSelectedPage();

      Nebula.logger.log("✅ [Polyfill] Detection active.");
    }

    _services() {
      return (
        globalThis.Services ||
        ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs")
          .Services
      );
    }

    updateSelectedPage(uri = gBrowser.selectedBrowser?.currentURI?.spec ?? "") {
      this.root.toggleAttribute(
        "nebula-settings-page",
        uri.startsWith("about:preferences"),
      );
      this.updateSettingsGlass();
    }

    updateSettingsGlass() {
      const browser = window.gBrowser?.selectedBrowser;
      const settings =
        this.root.getAttribute("zen-compact-mode") === "true" &&
        browser?.currentURI?.spec.startsWith("about:preferences");
      const doc = settings ? browser.contentDocument : null;

      if (this.settingsGlassDocument !== doc) {
        if (this.settingsGlassFrame)
          cancelAnimationFrame(this.settingsGlassFrame);
        this.settingsGlassFrame = 0;
        this.settingsGlass?.remove();
        this.settingsGlass = null;
        this.settingsGlassDocument = doc;
      }

      if (!doc?.body) {
        this.root.removeAttribute("nebula-settings-glass-ready");
        return;
      }

      if (!this.settingsGlass) {
        const glass = doc.createElement("div");
        glass.id = "nebula-settings-glass-underlay";
        glass.style.cssText =
          "position:fixed!important;z-index:2147483647!important;" +
          "pointer-events:none!important;display:none;" +
          "background:light-dark(rgb(255 255 255 / 12%),rgb(0 0 0 / 15%))!important;" +
          "border-radius:var(--nebula-border-radius,13px)!important;";
        doc.body.append(glass);
        this.settingsGlass = glass;
      }

      const blur = this._prefs?.getStringPref("var-nebula-glass-blur", "32px");
      const saturation = this._prefs?.getStringPref(
        "var-nebula-glass-saturation",
        "140%",
      );
      const filter = `blur(${blur || "32px"}) saturate(${saturation || "140%"})`;
      this.settingsGlass.style.setProperty(
        "backdrop-filter",
        CSS.supports("backdrop-filter", filter)
          ? filter
          : "blur(32px) saturate(140%)",
        "important",
      );
      this.root.setAttribute("nebula-settings-glass-ready", "true");
      this.positionSettingsGlass();
    }

    isSettingsSidebarActive() {
      return (
        document
          .getElementById("navigator-toolbox")
          ?.matches(
            ":is([zen-has-hover],[zen-user-show],[zen-has-empty-tab],[flash-popup],[has-popup-menu],[movingtab],[zen-compact-mode-active])",
          ) || this.root.getAttribute("zen-renaming-tab") === "true"
      );
    }

    positionSettingsGlass() {
      if (!this.settingsGlass?.isConnected) return;
      if (!this.isSettingsSidebarActive()) {
        if (this.settingsGlass.style.display !== "none")
          this.settingsGlass.style.display = "none";
        return;
      }
      const browser = gBrowser.selectedBrowser;
      const titlebar = document.getElementById("titlebar");
      if (!browser || !titlebar) return;
      const content = browser.getBoundingClientRect();
      const sidebar = titlebar.getBoundingClientRect();
      const left = Math.max(content.left, sidebar.left);
      const right = Math.min(content.right, sidebar.right);
      const top = Math.max(content.top, sidebar.top);
      const bottom = Math.min(content.bottom, sidebar.bottom);
      const glass = this.settingsGlass;
      if (right - left < 2 || bottom - top < 2) {
        if (glass.style.display !== "none") glass.style.display = "none";
        return;
      }
      const x = `${left - content.left}px`;
      const y = `${top - content.top}px`;
      const width = `${right - left}px`;
      const height = `${bottom - top}px`;
      if (glass.style.left !== x) glass.style.left = x;
      if (glass.style.top !== y) glass.style.top = y;
      if (glass.style.width !== width) glass.style.width = width;
      if (glass.style.height !== height) glass.style.height = height;
      if (glass.style.display !== "block") glass.style.display = "block";
    }

    animateSettingsGlass() {
      // A hidden sidebar has no blur surface to track. Cancel the reveal loop
      // as soon as Zen removes its active attribute.
      if (!this.settingsGlass?.isConnected || !this.isSettingsSidebarActive()) {
        if (this.settingsGlassFrame)
          cancelAnimationFrame(this.settingsGlassFrame);
        this.settingsGlassFrame = 0;
        this.positionSettingsGlass();
        return;
      }
      if (this.settingsGlassFrame) return;
      const end = performance.now() + 350;
      const tick = () => {
        this.positionSettingsGlass();
        this.settingsGlassFrame =
          this.isSettingsSidebarActive() && performance.now() < end
            ? requestAnimationFrame(tick)
            : 0;
      };
      tick();
    }

    /** Sine applies Nebula's string defaults only when its settings UI opens. */
    ensureRuntimePrefs() {
      try {
        const prefs = this._services().prefs;

        // Same keys original Nebula writes when its settings panel is opened.
        // Sine only applies string defaultValues during that parse, so a
        // first-time install of this fork never created them otherwise.
        const stringDefaults = {
          "var-nebula-glass-blur": "32px",
          "var-nebula-glass-saturation": "140%",
          "var-nebula-color-glass-light": "rgba(255, 255, 255, 0.4)",
          "var-nebula-color-glass-dark": "rgba(0, 0, 0, 0.4)",
          "var-nebula-ui-tint-light": "rgba(255,255,255,0.2)",
          "var-nebula-ui-tint-dark": "rgba(0,0,0,0.2)",
          "var-nebula-website-tint-light": "rgba(255,255,255,0)",
          "var-nebula-website-tint-dark": "rgba(0,0,0,0)",
          "var-nebula-tabs-minimum-light": "rgba(255, 255, 255, 0.1)",
          "var-nebula-tabs-minimum-dark": "rgba(0, 0, 0, 0.2)",
          "var-nebula-tabs-default-light": "rgba(255,255,255,0.25)",
          "var-nebula-tabs-default-dark": "rgba(0,0,0,0.35)",
          "var-nebula-tabs-hover-light": "rgba(255,255,255,0.35)",
          "var-nebula-tabs-hover-dark": "rgba(0,0,0,0.45)",
          "var-nebula-tabs-selected-light": "rgba(255,255,255,0.45)",
          "var-nebula-tabs-selected-dark": "rgba(0,0,0,0.55)",
          "var-nebula-color-shadow-light": "rgba(255, 255, 255, 0.055)",
          "var-nebula-color-shadow-dark": "rgba(0, 0, 0, 0.55)",
          "var-nebula-border-radius": "13px",
          "var-nebula-essentials-width": "60px",
          "var-nebula-workspace-grayscale": "100%",
        };
        for (const [name, value] of Object.entries(stringDefaults)) {
          if (!prefs.prefHasUserValue(name)) {
            prefs.setStringPref(name, value);
          }
        }

        this._migrateUiFontPref(prefs);
      } catch (err) {
        Nebula.logger.warn(
          `⚠️ [Polyfill] Could not apply runtime prefs: ${err}`,
        );
      }
    }

    _migrateUiFontPref(prefs) {
      const name = "nebula-ui-font";
      const type = prefs.getPrefType(name);
      if (type === 0) {
        prefs.setStringPref(name, "browser");
      } else if (type === prefs.PREF_INT || type === 64) {
        const map = [
          "browser",
          "system-ui",
          "segoe-ui",
          "inter",
          "comfortaa",
          "geist",
          "ibm-plex-sans",
          "arial",
          "browser",
        ];
        const id = prefs.getIntPref(name, 0);
        prefs.clearUserPref(name);
        prefs.setStringPref(name, map[id] || "browser");
      } else if (type === prefs.PREF_STRING || type === 32) {
        const current = prefs.getStringPref(name, "browser");
        if (current === "inherit") {
          prefs.setStringPref(name, "browser");
        }
      }

      if (prefs.getPrefType("nebula-ui-font-weight") === 0) {
        prefs.setStringPref("nebula-ui-font-weight", "400");
      }

      const oldCustom = "var-nebula-ui-font-custom";
      const newCustom = "nebula-ui-font-custom";
      if (prefs.getPrefType(oldCustom) === 32) {
        const value = prefs.getStringPref(oldCustom, "").trim();
        if (value && prefs.getPrefType(newCustom) === 0) {
          prefs.setStringPref(newCustom, value);
        }
        if (
          value &&
          !prefs.getBoolPref("nebula-ui-font-custom-enable", false)
        ) {
          prefs.setBoolPref("nebula-ui-font-custom-enable", true);
        }
        prefs.clearUserPref(oldCustom);
      }
    }

    updateToolbarModes() {
      const hasSidebar = this.root.hasAttribute("zen-sidebar-expanded");
      const isSingle = this.root.hasAttribute("zen-single-toolbar");

      this.root.toggleAttribute("nebula-single-toolbar", isSingle);
      this.root.toggleAttribute(
        "nebula-multi-toolbar",
        hasSidebar && !isSingle,
      );
      this.root.toggleAttribute(
        "nebula-collapsed-toolbar",
        !hasSidebar && !isSingle,
      );
    }

    async updateFaviconColor(e) {
      if (this._destroyed) return;

      if (
        e?.type === "TabAttrModified" &&
        !e.detail?.changed?.includes("image")
      )
        return;

      // The favicon is only needed for the icon-color active-tab glow.
      let activeTabGlow = 0;
      try {
        activeTabGlow = (this._prefs || this._services().prefs).getIntPref(
          "nebula-active-tab-glow",
          0,
        );
      } catch {}
      if (activeTabGlow !== 2) {
        this._faviconRequest++;
        if (this._faviconTimeout) clearTimeout(this._faviconTimeout);
        this.root.style.removeProperty("--nebula-selected-favicon-color");
        return;
      }

      const tab = gBrowser.selectedTab;
      const iconUrl = tab?.getAttribute("image");
      const requestId = ++this._faviconRequest;
      if (this._faviconTimeout) clearTimeout(this._faviconTimeout);
      if (!iconUrl) {
        this.root.style.removeProperty("--nebula-selected-favicon-color");
        return;
      }

      // Debounce favicon decoding while the selected tab is changing.
      this._faviconTimeout = setTimeout(async () => {
        this._faviconTimeout = null;
        if (this._destroyed) return;
        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = iconUrl;
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });

          // A tab switch or favicon update may have happened while the image
          // was loading. Never let an old request paint a current-tab color.
          if (
            requestId !== this._faviconRequest ||
            gBrowser.selectedTab !== tab ||
            tab.getAttribute("image") !== iconUrl
          )
            return;

          const size = 16; // smaller canvas
          if (!this._faviconCanvas) {
            this._faviconCanvas = document.createElement("canvas");
            this._faviconCanvas.width = size;
            this._faviconCanvas.height = size;
            this._faviconCtx = this._faviconCanvas.getContext("2d");
          }

          const ctx = this._faviconCtx;
          ctx.clearRect(0, 0, size, size);
          ctx.drawImage(img, 0, 0, size, size);

          const data = ctx.getImageData(0, 0, size, size).data;
          const counts = new Map();

          for (let i = 0; i < data.length; i += 4) {
            const [r, g, b, a] = [
              data[i],
              data[i + 1],
              data[i + 2],
              data[i + 3],
            ];
            if (a < 128) continue;
            const key = `${r & 0xfc},${g & 0xfc},${b & 0xfc}`; // round to multiple of 4
            const color = counts.get(key);
            if (color) color.freq++;
            else counts.set(key, { r, g, b, freq: 1 });
          }

          let best = null;
          let brightCandidate = null;

          for (const c of counts.values()) {
            const hsl = this.rgbToHsl(c.r, c.g, c.b);
            const vibrancy = hsl.s * (1 - Math.abs(0.5 - hsl.l) * 2);
            const brightness = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
            const score = c.freq * vibrancy * brightness;

            if (!best || score > best.score)
              best = { ...c, score, brightness, hsl };
            if (brightness > 0.5) {
              if (!brightCandidate || score > brightCandidate.score)
                brightCandidate = { ...c, score, brightness, hsl };
            }
          }

          if (best && best.r + best.g + best.b < 300 && brightCandidate)
            best = brightCandidate;

          if (best) {
            let { r, g, b, hsl } = best;
            const sum = r + g + b;
            if (sum < 180) {
              // very dark
              let newL = Math.max(hsl.l, 0.4);
              newL = Math.min(newL * 1.6, 0.8);
              let newS = Math.min(hsl.s * 1.2, 1);
              ({ r, g, b } = this.hslToRgb(hsl.h, newS, newL));
            }

            const finalColor = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
            this.root.style.setProperty(
              "--nebula-selected-favicon-color",
              finalColor,
            );
          } else {
            this.root.style.removeProperty("--nebula-selected-favicon-color");
          }
        } catch (err) {
          if (requestId === this._faviconRequest)
            this.root.style.removeProperty("--nebula-selected-favicon-color");
          Nebula.logger.warn(`[Polyfill] Favicon color unavailable: ${err}`);
        }
      }, 100);
    }

    // helper: convert HSL to RGB
    hslToRgb(h, s, l) {
      let r, g, b;
      if (s === 0) {
        r = g = b = l; // achromatic
      } else {
        const hue2rgb = (p, q, t) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
      }
      return { r: r * 255, g: g * 255, b: b * 255 };
    }

    // helper: convert RGB to HSL
    rgbToHsl(r, g, b) {
      r /= 255;
      g /= 255;
      b /= 255;
      const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
      let h,
        s,
        l = (max + min) / 2;

      if (max === min) {
        h = s = 0;
      } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r:
            h = (g - b) / d + (g < b ? 6 : 0);
            break;
          case g:
            h = (b - r) / d + 2;
            break;
          case b:
            h = (r - g) / d + 4;
            break;
        }
        h /= 6;
      }
      return { h, s, l };
    }

    destroy() {
      this._destroyed = true;
      this.compactObserver?.disconnect();
      this.modeObserver?.disconnect();
      this.settingsGlassObserver?.disconnect();
      if (this.settingsGlassFrame)
        cancelAnimationFrame(this.settingsGlassFrame);
      this.settingsGlassFrame = 0;
      this.settingsGlass?.remove();
      this.settingsGlass = null;
      this.settingsGlassDocument = null;
      window.gBrowser?.removeEventListener("load", this._onSettingsLoad, true);
      window.removeEventListener("resize", this._onSettingsResize);
      this._gBrowserWaitResolve?.(false);
      this._gBrowserWaitResolve = null;
      if (this._gBrowserWaitTimer) clearTimeout(this._gBrowserWaitTimer);
      this._gBrowserWaitTimer = null;
      if (this._faviconTimeout) clearTimeout(this._faviconTimeout);
      this._faviconRequest++;

      try {
        for (const name of [
          "nebula-active-tab-glow",
          "var-nebula-glass-blur",
          "var-nebula-glass-saturation",
        ]) {
          this._prefs?.removeObserver(name, this._prefObserver);
        }
      } catch {}
      this._prefs = null;

      this.root.removeAttribute("nebula-ui-font");
      this.root.style.removeProperty("--nebula-ui-font");
      this.root.style.removeProperty("--nebula-ui-font-custom");
      this.root.style.removeProperty("--fontfamily-ui");
      this.root.style.removeProperty("--nebula-selected-favicon-color");

      if (window.gBrowser?.tabContainer) {
        gBrowser.tabContainer.removeEventListener(
          "TabSelect",
          this.updateFaviconColor,
        );
        gBrowser.tabContainer.removeEventListener(
          "TabAttrModified",
          this.updateFaviconColor,
        );
        gBrowser.tabContainer.removeEventListener(
          "TabSelect",
          this._onTabSelect,
        );
        gBrowser.removeTabsProgressListener(this._pageProgressListener);
      }

      this.root.removeAttribute("nebula-settings-page");
      this.root.removeAttribute("nebula-settings-glass-ready");

      this.root.removeAttribute("nebula-single-toolbar");
      this.root.removeAttribute("nebula-multi-toolbar");
      this.root.removeAttribute("nebula-collapsed-toolbar");

      Nebula.logger.log("🧹 [Polyfill] Destroyed.");
    }
  }

  // ========== NebulaGradientSliderModule ==========
  class NebulaGradientSliderModule {
    constructor() {
      this.root = document.documentElement;
      this.gradientSlider = null;
      this._patched = false;
      this._sliderHandler = this.sync.bind(this);
      this._onUiReady = this._onUiReady.bind(this);
      this._patchedPrototype = null;

      // Store original methods without polluting prototype
      this._origMethods = new WeakMap();
    }

    init() {
      this._onUiReady();
      window.addEventListener("load", this._onUiReady, { once: true });
      document.addEventListener("popupshowing", this._onUiReady, true);
    }

    _onUiReady() {
      const slider = document.getElementById(
        "PanelUI-zen-gradient-generator-opacity",
      );
      if (slider && this.gradientSlider !== slider) {
        this.gradientSlider?.removeEventListener("input", this._sliderHandler);
        this.gradientSlider = slider;
        slider.min = 0;
        slider.addEventListener("input", this._sliderHandler);
        this.sync();
      }
      this._patchThemePicker();
    }

    sync() {
      if (!this.gradientSlider) return;
      const val = +this.gradientSlider.value;
      const isZero = val === 0;
      if (isZero) {
        this.root.style.setProperty("--nebula-gradient-opacity", "0");
      } else {
        this.root.style.removeProperty("--nebula-gradient-opacity");
      }
      this.root.toggleAttribute("nebula-zen-gradient-contrast-zero", isZero);
      Nebula.logger.debug?.(`[GradientSlider] Sync → ${val}`);
    }

    _patchThemePicker() {
      if (this._patched) return;

      const proto = window.gZenThemePicker?.constructor?.prototype;
      if (!proto?.blendWithWhiteOverlay) return;

      // Save original
      this._origMethods.set(proto, proto.blendWithWhiteOverlay);

      const moduleInstance = this;

      proto.blendWithWhiteOverlay = function (baseColor, opacity) {
        const val = moduleInstance.gradientSlider
          ? Number(moduleInstance.gradientSlider.value)
          : opacity;
        if (val === 0) {
          if (Array.isArray(baseColor)) {
            return `rgba(${baseColor.join(",")},0)`;
          }
          if (typeof baseColor === "string" && baseColor.startsWith("rgb")) {
            return baseColor.replace(/rgb(a)?\(([^)]+)\)/, "rgba($2, 0)");
          }
          return "rgba(0,0,0,0)";
        }
        // Call the original method with the correct context
        return moduleInstance._origMethods
          .get(proto)
          .call(this, baseColor, opacity);
      };

      this._patchedPrototype = proto;
      this._patched = true;
      Nebula.logger.log("✅ [GradientSlider] Patched blendWithWhiteOverlay");
    }

    destroy() {
      window.removeEventListener("load", this._onUiReady);
      document.removeEventListener("popupshowing", this._onUiReady, true);
      if (this.gradientSlider) {
        this.gradientSlider.removeEventListener("input", this._sliderHandler);
        this.gradientSlider = null;
      }

      if (this._patched) {
        const proto = this._patchedPrototype;
        if (proto && this._origMethods.has(proto)) {
          proto.blendWithWhiteOverlay = this._origMethods.get(proto);
          this._origMethods.delete(proto);
        }
        this._patched = false;
        this._patchedPrototype = null;
      }

      this.root.style.removeProperty("--nebula-gradient-opacity");
      this.root.removeAttribute("nebula-zen-gradient-contrast-zero");
      Nebula.logger.log("🧹 [GradientSlider] Destroyed");
    }
  }

  // ========== NebulaTitlebarBackgroundModule ==========
  class NebulaTitlebarBackgroundModule {
    constructor() {
      this.root = document.documentElement;
      this.browser = document.getElementById("browser");
      this.titlebar = document.getElementById("titlebar");
      this.overlay = null;
      this.lastRect = {};
      this.lastVisible = false;
      this.animationFrameId = null;

      this.update = this.update.bind(this);
      this.scheduleUpdate = this.scheduleUpdate.bind(this);
      this._compactCallback = this._compactCallback.bind(this);
      this.resizeObserver = null;
      this.rootObserver = null;
    }

    init() {
      if (!this.browser || !this.titlebar) {
        Nebula.logger.warn(
          "⚠️ [TitlebarBackground] Required elements not found.",
        );
        return;
      }

      this.overlay = document.createElement("div");
      this.overlay.id = "Nebula-titlebar-background";
      Object.assign(this.overlay.style, {
        position: "absolute",
        display: "none",
      });
      this.browser.appendChild(this.overlay);

      this.resizeObserver = new ResizeObserver(this.scheduleUpdate);
      this.resizeObserver.observe(this.titlebar);
      this.resizeObserver.observe(this.browser);
      window.addEventListener("resize", this.scheduleUpdate);
      this.titlebar.addEventListener("transitionrun", this.scheduleUpdate);
      this.titlebar.addEventListener("transitionend", this.scheduleUpdate);
      this.rootObserver = new MutationObserver(this.scheduleUpdate);
      this.rootObserver.observe(this.root, {
        attributes: true,
        attributeFilter: [
          "nebula-compact-mode",
          "zen-sidebar-expanded",
          "zen-right-side",
          "zen-single-toolbar",
        ],
      });

      window.gZenCompactModeManager?.addEventListener?.(this._compactCallback);

      if (this.root.hasAttribute("nebula-compact-mode")) {
        this.startLiveTracking();
      }

      Nebula.logger.log("✅ [TitlebarBackground] Tracking initialized.");
    }

    _compactCallback() {
      const isCompact = this.root.hasAttribute("nebula-compact-mode");
      if (isCompact) {
        this.startLiveTracking();
      } else {
        this.stopLiveTracking();
        this.hideOverlay();
      }
    }

    scheduleUpdate() {
      if (this.animationFrameId !== null) return;
      this.animationFrameId = requestAnimationFrame(() => {
        this.animationFrameId = null;
        this.update();
      });
    }

    update() {
      const isCompact = this.root.hasAttribute("nebula-compact-mode");

      if (!isCompact) {
        this.stopLiveTracking();
        this.hideOverlay();
        return;
      }

      const rect = this.titlebar.getBoundingClientRect();
      const style = getComputedStyle(this.titlebar);

      const isVisible =
        rect.width > 5 &&
        rect.height > 5 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight;

      const changed =
        rect.top !== this.lastRect.top ||
        rect.left !== this.lastRect.left ||
        rect.width !== this.lastRect.width ||
        rect.height !== this.lastRect.height;

      if (!changed && this.lastVisible === isVisible) {
        return;
      }

      this.lastRect = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };

      if (isVisible) {
        Object.assign(this.overlay.style, {
          top: `${rect.top + window.scrollY}px`,
          left: `${rect.left + window.scrollX}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          display: "block",
        });

        if (!this.lastVisible) {
          this.overlay.classList.add("visible");
          this.lastVisible = true;
        }
      } else {
        this.hideOverlay();
      }
    }

    hideOverlay() {
      if (this.overlay) {
        this.overlay.classList.remove("visible");
        this.overlay.style.display = "none";
      }
      this.lastVisible = false;
    }

    startLiveTracking() {
      this.stopLiveTracking();
      this.scheduleUpdate();
    }

    stopLiveTracking() {
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }

    destroy() {
      window.gZenCompactModeManager?.removeEventListener?.(
        this._compactCallback,
      );
      window.removeEventListener("resize", this.scheduleUpdate);
      this.titlebar?.removeEventListener("transitionrun", this.scheduleUpdate);
      this.titlebar?.removeEventListener("transitionend", this.scheduleUpdate);
      this.resizeObserver?.disconnect();
      this.rootObserver?.disconnect();
      this.stopLiveTracking();
      this.hideOverlay();
      this.overlay?.remove();
      this.overlay = null;
      Nebula.logger.log("🧹 [TitlebarBackground] Destroyed.");
    }
  }

  // ========== NebulaURLBarBackgroundModule ==========
  class NebulaURLBarBackgroundModule {
    constructor() {
      this.root = document.documentElement;
      this.browser = document.getElementById("browser");
      this.urlbar = document.getElementById("urlbar");
      this.overlay = null;
      this.lastRect = {};
      this.lastVisible = false;
      this.animationFrameId = null;

      this.update = this.update.bind(this);
      this.scheduleUpdate = this.scheduleUpdate.bind(this);
      this.mutationObserver = null;
      this.resizeObserver = null;
    }

    init() {
      if (!this.browser || !this.urlbar) {
        Nebula.logger.warn(
          "⚠️ [URLBarBackground] Required elements not found.",
        );
        return;
      }

      this.overlay = document.createElement("div");
      this.overlay.id = "Nebula-urlbar-background";
      Object.assign(this.overlay.style, {
        position: "absolute",
        display: "none",
      });
      this.browser.appendChild(this.overlay);

      this.resizeObserver = new ResizeObserver(this.scheduleUpdate);
      this.resizeObserver.observe(this.urlbar);
      this.resizeObserver.observe(this.browser);
      window.addEventListener("resize", this.scheduleUpdate);
      this.urlbar.addEventListener("transitionrun", this.scheduleUpdate);
      this.urlbar.addEventListener("transitionend", this.scheduleUpdate);
      this.urlbar.addEventListener("animationstart", this.scheduleUpdate);
      this.urlbar.addEventListener("animationend", this.scheduleUpdate);

      // Start mutation observer for `open` attribute change
      this.mutationObserver = new MutationObserver(() => this.onMutation());
      this.mutationObserver.observe(this.urlbar, {
        attributes: true,
        attributeFilter: ["open"],
      });

      if (this.urlbar.hasAttribute("open")) {
        this.startLiveTracking();
      }

      Nebula.logger.log("✅ [URLBarBackground] Tracking initialized.");
    }

    scheduleUpdate() {
      if (this.animationFrameId !== null) return;
      this.animationFrameId = requestAnimationFrame(() => {
        this.animationFrameId = null;
        this.update();
      });
    }

    onMutation() {
      const isOpen = this.urlbar.hasAttribute("open");
      if (isOpen) {
        this.startLiveTracking();
      } else {
        this.stopLiveTracking();
        this.hideOverlay();
      }
    }

    update() {
      const isOpen = this.urlbar.hasAttribute("open");
      if (!isOpen) {
        this.stopLiveTracking();
        this.hideOverlay();
        return;
      }

      const rect = this.urlbar.getBoundingClientRect();
      const style = getComputedStyle(this.urlbar);

      const isVisible =
        rect.width > 5 &&
        rect.height > 5 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight;

      const changed =
        rect.top !== this.lastRect.top ||
        rect.left !== this.lastRect.left ||
        rect.width !== this.lastRect.width ||
        rect.height !== this.lastRect.height;

      if (!changed && this.lastVisible === isVisible) {
        return;
      }

      this.lastRect = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };

      if (isVisible) {
        Object.assign(this.overlay.style, {
          top: `${rect.top + window.scrollY}px`,
          left: `${rect.left + window.scrollX}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          display: "block",
        });

        if (!this.lastVisible) {
          this.overlay.classList.add("visible");
          this.lastVisible = true;
        }
      } else {
        this.hideOverlay();
      }
    }

    hideOverlay() {
      if (this.overlay) {
        this.overlay.classList.remove("visible");
        this.overlay.style.display = "none";
      }
      this.lastVisible = false;
    }

    startLiveTracking() {
      this.stopLiveTracking();
      this.scheduleUpdate();
    }

    stopLiveTracking() {
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }

    destroy() {
      this.mutationObserver?.disconnect();
      window.removeEventListener("resize", this.scheduleUpdate);
      this.urlbar?.removeEventListener("transitionrun", this.scheduleUpdate);
      this.urlbar?.removeEventListener("transitionend", this.scheduleUpdate);
      this.urlbar?.removeEventListener("animationstart", this.scheduleUpdate);
      this.urlbar?.removeEventListener("animationend", this.scheduleUpdate);
      this.resizeObserver?.disconnect();
      this.stopLiveTracking();
      this.hideOverlay();
      this.overlay?.remove();
      this.overlay = null;
      Nebula.logger.log("🧹 [URLBarBackground] Destroyed.");
    }
  }

  // ========== NebulaMediaCoverArtModule ==========
  class NebulaMediaCoverArtModule {
    constructor() {
      this.OVERLAY_CLASS = "Nebula-media-cover-art";
      this.toolbar = null;
      this.cardControllers = new Map();
      this.originalActivateMediaControls = null;
      this.patchedActivateMediaControls = null;
      this.cardObserver = null;
      this._controllerWaitTimer = null;
      this._destroyed = false;
      this._prefs = null;
      this.backgroundEnabled = false;
      this.backgroundStyle = "blur";
      this._prefObserver = {
        observe: () => this._syncPreferences(),
      };
    }

    init() {
      this._destroyed = false;
      this._waitForController();
    }

    _waitForController() {
      if (this._destroyed) return;
      if (
        typeof window.gZenMediaController?.activateMediaControls ===
          "function" &&
        document.querySelector("#zen-media-controls-toolbar")
      ) {
        this._onControllerReady();
      } else {
        this._controllerWaitTimer = setTimeout(() => {
          this._controllerWaitTimer = null;
          this._waitForController();
        }, 200);
      }
    }

    _onControllerReady() {
      if (this.originalActivateMediaControls) return;

      const manager = window.gZenMediaController;
      this.toolbar = document.querySelector("#zen-media-controls-toolbar");
      this.originalActivateMediaControls = manager.activateMediaControls;
      this.patchedActivateMediaControls = (controller, browser) => {
        const existingCards = new Set(this._getCards());
        const result = this.originalActivateMediaControls.call(
          manager,
          controller,
          browser,
        );
        const newCard = this._getCards().find(
          (card) =>
            !existingCards.has(card) && !card.hasAttribute("media-sharing"),
        );
        if (newCard) this._bindCard(newCard, controller, browser);
        return result;
      };
      manager.activateMediaControls = this.patchedActivateMediaControls;

      this.cardObserver = new MutationObserver(() => this._pruneCards());
      this.cardObserver.observe(this.toolbar, { childList: true });
      try {
        this._prefs =
          globalThis.Services?.prefs ||
          ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs")
            .Services.prefs;
        this._prefs.addObserver(
          "nebula-media-background-enabled",
          this._prefObserver,
        );
        this._prefs.addObserver(
          "nebula-media-background-style",
          this._prefObserver,
        );
        this._syncPreferences();
      } catch (err) {
        Nebula.logger.warn(
          `⚠️ [MediaCoverArt] Could not observe settings: ${err}`,
        );
      }
      this._bindExistingCards();

      Nebula.logger.log("✅ [MediaCoverArt] Hooked into MediaPlayer.");
    }

    _getCards() {
      return Array.from(
        this.toolbar?.querySelectorAll(".zen-media-card") || [],
      );
    }

    _syncPreferences() {
      this.backgroundEnabled = this._prefs?.getBoolPref(
        "nebula-media-background-enabled",
        false,
      );
      const style = this._prefs?.getStringPref(
        "nebula-media-background-style",
        "blur",
      );
      this.backgroundStyle = style === "thumbnail" ? "thumbnail" : "blur";
      for (const [card, { controller, browser }] of this.cardControllers) {
        this._updateCardArtwork(card, controller, browser);
      }
    }

    _bindExistingCards() {
      const candidates = [];
      for (const browser of window.gBrowser?.browsers || []) {
        try {
          const controller = browser.browsingContext?.mediaController;
          if (typeof controller?.getMetadata !== "function") continue;
          let title = null;
          try {
            title = controller.getMetadata()?.title;
          } catch {
            // Inactive controllers can reject metadata requests.
          }
          candidates.push({ browser, controller, title });
        } catch {
          // A discarded tab may no longer expose its browsing context.
        }
      }

      for (const card of this._getCards()) {
        if (card.hasAttribute("media-sharing")) continue;
        const title = card.querySelector(".zen-media-title")?.textContent;
        let index = candidates.findIndex(
          (candidate) => candidate.title && candidate.title === title,
        );
        if (index < 0) {
          const activeCandidates = candidates.filter(
            ({ controller }) => controller.isActive,
          );
          if (activeCandidates.length === 1) {
            index = candidates.indexOf(activeCandidates[0]);
          } else if (candidates.length === 1) {
            index = 0;
          }
        }
        if (index >= 0) {
          const { controller, browser } = candidates.splice(index, 1)[0];
          this._bindCard(card, controller, browser);
        }
      }
    }

    _bindCard(card, controller, browser) {
      if (!controller?.getMetadata || this.cardControllers.has(card)) return;
      const onMetadataChange = () =>
        this._updateCardArtwork(card, controller, browser);
      controller.addEventListener("metadatachange", onMetadataChange);
      this.cardControllers.set(card, { controller, browser, onMetadataChange });
      this._updateCardArtwork(card, controller, browser);
    }

    _pruneCards() {
      for (const [card, entry] of this.cardControllers) {
        if (card.isConnected) continue;
        entry.controller.removeEventListener(
          "metadatachange",
          entry.onMetadataChange,
        );
        this.cardControllers.delete(card);
      }
    }

    _youtubeArtwork(browser) {
      try {
        const url = new URL(browser.currentURI.spec);
        const hostname = url.hostname.toLowerCase();
        let videoId = null;
        if (
          [
            "youtube.com",
            "www.youtube.com",
            "m.youtube.com",
            "music.youtube.com",
          ].includes(hostname)
        ) {
          videoId =
            url.pathname === "/watch"
              ? url.searchParams.get("v")
              : url.pathname.match(/^\/(?:shorts|live)\/([^/]+)/)?.[1];
        } else if (hostname === "youtu.be") {
          videoId = url.pathname.slice(1);
        }
        if (/^[a-zA-Z0-9_-]{11}$/.test(videoId || "")) {
          return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        }
      } catch {}
      return null;
    }

    _updateCardArtwork(card, controller, browser) {
      if (!this.backgroundEnabled) {
        this._removeCardArtwork(card);
        return;
      }

      let metadata = null;
      try {
        metadata = controller?.getMetadata?.();
      } catch {
        // The URL fallback can still provide artwork for a YouTube tab.
      }
      const artwork = metadata?.artwork;
      const sorted = (Array.isArray(artwork) ? [...artwork] : []).sort(
        (a, b) => {
          const [aw, ah] = a?.sizes?.split("x").map(Number) || [0, 0];
          const [bw, bh] = b?.sizes?.split("x").map(Number) || [0, 0];
          return bw * bh - aw * ah;
        },
      );

      const safeUrl = (candidate) => {
        try {
          const url = new URL(candidate);
          if (["http:", "https:", "data:", "blob:"].includes(url.protocol)) {
            return url.href;
          }
        } catch {}
        return null;
      };
      const coverUrl =
        sorted.map((item) => safeUrl(item?.src)).find(Boolean) ||
        safeUrl(this._youtubeArtwork(browser));
      if (!coverUrl) {
        this._removeCardArtwork(card);
        return;
      }

      let overlay = card.querySelector(`.${this.OVERLAY_CLASS}`);
      if (!overlay) {
        overlay = document.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "div",
        );
        overlay.className = this.OVERLAY_CLASS;
        card.prepend(overlay);
      }
      overlay.style.setProperty(
        "--nebula-media-cover-url",
        `url(${JSON.stringify(coverUrl)})`,
      );
      overlay.classList.add("visible");
      card.setAttribute("nebula-has-cover-art", "true");
      card.setAttribute("nebula-media-background-style", this.backgroundStyle);
    }

    _removeCardArtwork(card) {
      card.removeAttribute("nebula-has-cover-art");
      card.removeAttribute("nebula-media-background-style");
      card.querySelector(`.${this.OVERLAY_CLASS}`)?.remove();
    }

    destroy() {
      this._destroyed = true;
      if (this._controllerWaitTimer) {
        clearTimeout(this._controllerWaitTimer);
        this._controllerWaitTimer = null;
      }

      if (
        window.gZenMediaController?.activateMediaControls ===
        this.patchedActivateMediaControls
      ) {
        window.gZenMediaController.activateMediaControls =
          this.originalActivateMediaControls;
      }
      this.originalActivateMediaControls = null;
      this.patchedActivateMediaControls = null;
      this.cardObserver?.disconnect();
      this.cardObserver = null;
      for (const name of [
        "nebula-media-background-enabled",
        "nebula-media-background-style",
      ]) {
        try {
          this._prefs?.removeObserver(name, this._prefObserver);
        } catch {}
      }
      this._prefs = null;
      for (const [card, entry] of this.cardControllers) {
        entry.controller.removeEventListener(
          "metadatachange",
          entry.onMetadataChange,
        );
        this._removeCardArtwork(card);
      }
      this.cardControllers.clear();
      this.toolbar = null;

      Nebula.logger.log("🧹 [MediaCoverArt] Destroyed.");
    }
  }

  // ========== NebulaMenuModule ==========
  class NebulaMenuModule {
    constructor() {
      this.root = document.documentElement;
      this.STAGGER_DELAY = 15;
      this.MAX_DELAY = 200;
      this.MENU_ITEM_SELECTORS = [
        "menuitem",
        "menuseparator",
        ".subviewbutton",
        ".panel-menuitem",
        ".panel-list-item",
        ".PanelUI-subView .subviewbutton",
        ".panel-subview-body > *",
        ".panel-subview .subviewbutton",
        'toolbarbutton[class*="subviewbutton"]',
        ".cui-widget-panel .subviewbutton",
        "vbox.panel-subview-body > *",
        ".panel-subview-body > toolbarbutton",
        ".panel-subview-body > .subviewbutton",
      ];

      this.observers = new Map();
      this._menuTimers = new Map();

      // Bind methods
      this.handlePopupShowing = this.handlePopupShowing.bind(this);
      this.handlePopupHidden = this.handlePopupHidden.bind(this);
    }

    init() {
      document.addEventListener("popupshowing", this.handlePopupShowing, true);
      document.addEventListener("popuphidden", this.handlePopupHidden, true);
      document.addEventListener("ViewShowing", this.handlePopupShowing, true);
      document.addEventListener("ViewHiding", this.handlePopupHidden, true);

      Nebula.logger.log("✅ [MenuModule] Animations initialized.");
    }

    getMenuItems(popup) {
      if (!popup) return [];
      let items = [];
      // Cache selector string
      const selectorString =
        this._cachedSelectorString ||
        (this._cachedSelectorString = this.MENU_ITEM_SELECTORS.join(","));

      if (popup.localName === "menupopup") {
        items = Array.from(popup.children);
      } else {
        const subviewBody = popup.querySelector(".panel-subview-body");
        items = Array.from(
          (subviewBody || popup).querySelectorAll(selectorString),
        );
      }

      // Flatten children only if needed
      const flattenedItems = [];
      for (const item of items) {
        if (
          item.matches &&
          item.matches(".panel-subview-body, .panel-subview")
        ) {
          for (const child of item.children) {
            if (
              this.MENU_ITEM_SELECTORS.some((selector) =>
                child.matches(selector),
              )
            ) {
              flattenedItems.push(child);
            }
          }
        } else {
          flattenedItems.push(item);
        }
      }

      // Filter visible elements efficiently
      return flattenedItems.filter((item) => {
        if (!item || item.nodeType !== 1) return false;
        const rect = item.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          getComputedStyle(item).display !== "none"
        );
      });
    }

    animateMenuItems(popup) {
      if (!popup) return;
      const items = this.getMenuItems(popup);
      const shouldAnimate =
        getComputedStyle(this.root)
          .getPropertyValue("--nebula-menu-animation")
          .trim() === "true";
      // Batch DOM updates for animation
      window.requestAnimationFrame(() => {
        if (!popup.isConnected) return;
        items.forEach((item, index) =>
          this.animateItem(item, index, shouldAnimate),
        );
      });
    }

    animateItem(item, index, shouldAnimate) {
      item.classList.remove("nebula-menu-anim");
      item.style.animationDelay = "";

      if (!shouldAnimate) return;

      const delay = Math.min(index * this.STAGGER_DELAY, this.MAX_DELAY);
      item.style.animationDelay = `${delay}ms`;
      item.classList.add("nebula-menu-anim");
    }

    cleanupMenuItems(popup) {
      if (!popup) return;
      // Batch DOM updates for cleanup
      window.requestAnimationFrame(() => {
        popup.querySelectorAll(".nebula-menu-anim").forEach((item) => {
          item.classList.remove("nebula-menu-anim");
          item.style.animationDelay = "";
        });
      });
    }

    isTargetMenu(popup) {
      if (!popup || !popup.localName) return false;
      const menuTypes = [
        "menupopup",
        "#appMenu-popup",
        "#PanelUI-popup",
        ".panel-popup",
        ".panel-subview",
        "#PanelUI-history",
        "#PanelUI-bookmarks",
        "#PanelUI-downloads",
      ];
      return (
        menuTypes.some((selector) =>
          selector.startsWith("#") || selector.startsWith(".")
            ? popup.matches && popup.matches(selector)
            : popup.localName === selector,
        ) ||
        popup.classList.contains("panel-subview") ||
        popup.classList.contains("PanelUI-subView") ||
        popup.querySelector(".panel-subview-body")
      );
    }

    setupMutationObserver(popup) {
      if (this.observers.has(popup)) return;

      const observer = new MutationObserver((mutations) => {
        if (
          mutations.some(
            (m) =>
              (m.type === "childList" && m.addedNodes.length > 0) ||
              (m.type === "attributes" &&
                ["hidden", "collapsed"].includes(m.attributeName)),
          )
        ) {
          clearTimeout(this._menuTimers.get(popup));
          this._menuTimers.set(
            popup,
            setTimeout(() => {
              this._menuTimers.delete(popup);
              this.animateMenuItems(popup);
            }, 5),
          );
        }
      });

      observer.observe(popup, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden", "collapsed", "disabled"],
      });

      this.observers.set(popup, observer);
    }

    handlePopupShowing(event) {
      const popup = event.target;
      if (!this.isTargetMenu(popup)) return;
      this.animateMenuItems(popup);
      this.setupMutationObserver(popup);
    }

    handlePopupHidden(event) {
      const popup = event.target;
      if (!this.isTargetMenu(popup)) return;
      clearTimeout(this._menuTimers.get(popup));
      this._menuTimers.delete(popup);
      this.cleanupMenuItems(popup);

      if (this.observers.has(popup)) {
        this.observers.get(popup).disconnect();
        this.observers.delete(popup);
      }
    }

    stop() {
      document.removeEventListener(
        "popupshowing",
        this.handlePopupShowing,
        true,
      );
      document.removeEventListener("popuphidden", this.handlePopupHidden, true);
      document.removeEventListener(
        "ViewShowing",
        this.handlePopupShowing,
        true,
      );
      document.removeEventListener("ViewHiding", this.handlePopupHidden, true);

      this.observers.forEach((observer) => observer.disconnect());
      this.observers.clear();
      this._menuTimers.forEach((timer) => clearTimeout(timer));
      this._menuTimers.clear();

      document.querySelectorAll(".nebula-menu-anim").forEach((item) => {
        item.classList.remove("nebula-menu-anim");
        item.style.animationDelay = "";
      });

      Nebula.logger.log("🛑 [MenuModule] Animations disabled.");
    }

    destroy() {
      this.stop();
      Nebula.logger.log("🧹 [MenuModule] Module destroyed.");
    }
  }

  // ========== NebulaCtrlTabDualBackgroundModule ==========
  class NebulaCtrlTabDualBackgroundModule {
    constructor({ trackingMode = "both" } = {}) {
      this.browser = document.getElementById("browser");
      this.panel = document.getElementById("ctrlTab-panel");
      this.overlays = {};
      this.lastRect = null;
      this.lastVisible = false;
      this.rafId = null;
      this.trackingMode = trackingMode;
      this.resizeObserver = null;

      this.update = this.update.bind(this);
      this.scheduleUpdate = this.scheduleUpdate.bind(this);
      this.onPopupShown = this.startTracking.bind(this);
      this.onPopupHidden = this.stopTracking.bind(this);
    }

    init() {
      if (!this.browser || !this.panel) {
        return Nebula.logger.warn(
          "⚠️ [CtrlTabDualBackground] Required elements not found.",
        );
      }

      if (this.trackingMode !== "below")
        this.overlays.above = this.createOverlay(
          "nebula-ctrltab-background-above",
          2147483646,
          true,
        );
      if (this.trackingMode !== "above")
        this.overlays.below = this.createOverlay(
          "nebula-ctrltab-background-below",
          0,
          false,
        );

      this.panel.addEventListener("popupshown", this.onPopupShown);
      this.panel.addEventListener("popuphidden", this.onPopupHidden);
      this.resizeObserver = new ResizeObserver(this.scheduleUpdate);
      this.resizeObserver.observe(this.panel);
      window.addEventListener("resize", this.scheduleUpdate);
      this.panel.addEventListener("transitionrun", this.scheduleUpdate);
      this.panel.addEventListener("transitionend", this.scheduleUpdate);

      Nebula.logger.log("✅ [CtrlTabDualBackground] Initialized.");
    }

    createOverlay(id, zIndex, interactive) {
      const o = document.createElement("div");
      o.id = id;
      Object.assign(o.style, {
        position: "absolute",
        display: "none",
        zIndex: interactive ? zIndex : "",
        pointerEvents: interactive ? "auto" : "none",
      });
      this.browser.appendChild(o);
      return o;
    }

    startTracking() {
      this.scheduleUpdate();
    }

    scheduleUpdate() {
      if (this.rafId !== null) return;
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.update();
      });
    }

    stopTracking() {
      if (this.rafId !== null) cancelAnimationFrame(this.rafId);
      this.rafId = null;
      this.hideOverlays();
    }

    update() {
      const p = this.panel;
      if (!p) return;

      const r = p.getBoundingClientRect();
      const cs = getComputedStyle(p);
      const visible =
        r.width > 5 &&
        r.height > 5 &&
        cs.display !== "none" &&
        cs.visibility !== "hidden";

      if (!visible) return this.hideOverlays();

      const changed =
        !this.lastRect ||
        r.top !== this.lastRect.top ||
        r.left !== this.lastRect.left ||
        r.width !== this.lastRect.width ||
        r.height !== this.lastRect.height;

      if (!changed && this.lastVisible) return;

      this.lastRect = {
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      };
      const style = {
        top: `${r.top + window.scrollY}px`,
        left: `${r.left + window.scrollX}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        display: "block",
      };

      Object.values(this.overlays).forEach(
        (o) => o && Object.assign(o.style, style),
      );

      this.lastVisible = true;
    }

    hideOverlays() {
      Object.values(this.overlays).forEach(
        (o) => o && (o.style.display = "none"),
      );
      this.lastVisible = false;
    }

    destroy() {
      this.panel?.removeEventListener("popupshown", this.onPopupShown);
      this.panel?.removeEventListener("popuphidden", this.onPopupHidden);
      window.removeEventListener("resize", this.scheduleUpdate);
      this.panel?.removeEventListener("transitionrun", this.scheduleUpdate);
      this.panel?.removeEventListener("transitionend", this.scheduleUpdate);
      this.resizeObserver?.disconnect();
      this.stopTracking();
      Object.values(this.overlays).forEach((o) => o?.remove());
      this.overlays = {};
      Nebula.logger.log("🧹 [CtrlTabDualBackground] Destroyed.");
    }
  }

  // Register Nebula Modules
  Nebula.register(NebulaPolyfillModule);
  Nebula.register(NebulaGradientSliderModule);
  Nebula.register(NebulaTitlebarBackgroundModule);
  Nebula.register(NebulaURLBarBackgroundModule);
  Nebula.register(NebulaMediaCoverArtModule);
  Nebula.register(NebulaMenuModule);
  Nebula.register(NebulaCtrlTabDualBackgroundModule);

  // Start the core
  Nebula.init();
})();

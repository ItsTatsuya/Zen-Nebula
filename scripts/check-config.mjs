import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const preferences = JSON.parse(await read("preferences.json"));
const fields = preferences.filter((entry) => entry.property);
const theme = JSON.parse(await read("theme.json"));
const template = JSON.parse(await read("template/mods.json")).Nebula;
const pkg = JSON.parse(await read("package.json"));
const script = await read("js/nebula.uc.js");

async function styles(directory) {
  const files = await readdir(path.join(root, directory), {
    withFileTypes: true,
  });
  return (
    await Promise.all(
      files.map((file) => {
        const name = path.join(directory, file.name);
        return file.isDirectory()
          ? styles(name)
          : file.name.endsWith(".css")
            ? read(name)
            : "";
      }),
    )
  ).join("\n");
}
const css = await styles("nebula");
assert.equal(
  new Set(fields.map((field) => field.property)).size,
  fields.length,
);
for (const field of fields) {
  assert.ok(
    Object.hasOwn(field, "defaultValue"),
    `${field.property}: no default`,
  );
  const expectedType =
    field.type === "checkbox"
      ? "boolean"
      : field.value === "number"
        ? "number"
        : "string";
  assert.equal(typeof field.defaultValue, expectedType, field.property);
  assert.ok(
    css.includes(field.property) || script.includes(field.property),
    field.property,
  );
  if (field.type === "dropdown") {
    assert.ok(
      field.options.some((option) => option.value === field.defaultValue),
      field.property,
    );
    assert.equal(
      new Set(field.options.map((option) => option.value)).size,
      field.options.length,
    );
    for (const option of field.options) {
      assert.equal(typeof option.value, expectedType, field.property);
      // Default variants are unconditional CSS. Every other variant must have a consumer.
      if (option.value !== field.defaultValue && option.value !== "browser") {
        const value =
          typeof option.value === "number" ? option.value : `"${option.value}"`;
        const cssConsumer = new RegExp(
          `"${field.property}",\\s*${value}\\s*\\)`,
        ).test(css);
        const mediaConsumer =
          field.property === "nebula-media-background-style" &&
          script.includes(`style === ${value}`);
        assert.ok(cssConsumer || mediaConsumer, `${field.property}: ${value}`);
      }
    }
  }
}
for (const key of [
  "name",
  "version",
  "author",
  "description",
  "homepage",
  "image",
]) {
  assert.equal(template[key], theme[key], key);
}
assert.equal(theme.name, "Nebula Nova");
assert.equal(theme.author, pkg.author);
assert.equal(theme.version, pkg.version);
assert.ok(script.includes(`// @version        ${theme.version}`));
assert.ok(script.includes(`// @author         ${theme.author}`));
await access(path.join(root, "screenshots", path.basename(theme.image)));
assert.ok(!script.includes(".openDownload("), "Open file quick action remains");

// Exercise startup defaults against saved values, plus the CSS bridge lifecycle.
// This harness does not claim to test Firefox's GPU compositor or native widgets.
const saved = new Map([
  ["nebula-ui-font", "poppins"],
  ["var-nebula-border-radius", "21px"],
  ["var-nebula-color-glass-dark", "rgb(40 50 60 / 50%)"],
]);
const defaults = new Map();
const setDefault = (name, value) => defaults.set(name, value);
const prefs = {
  getDefaultBranch: () => ({
    setBoolPref: setDefault,
    setIntPref: setDefault,
    setStringPref: setDefault,
  }),
  getPrefType: (name) => {
    const value = saved.get(name) ?? defaults.get(name);
    return typeof value === "string"
      ? 32
      : typeof value === "boolean"
        ? 128
        : typeof value === "number"
          ? 64
          : 0;
  },
  prefHasUserValue: (name) => saved.has(name),
  getStringPref: (name, fallback) =>
    saved.get(name) ?? defaults.get(name) ?? fallback,
  setStringPref: (name, value) => saved.set(name, value),
  getBoolPref: (name, fallback) =>
    saved.get(name) ?? defaults.get(name) ?? fallback,
  getIntPref: (name, fallback) =>
    saved.get(name) ?? defaults.get(name) ?? fallback,
  setBoolPref: (name, value) => saved.set(name, value),
  clearUserPref: (name) => saved.delete(name),
  removeObserver: () => {},
};
const registered = new Set();
const sheets = {
  USER_SHEET: 1,
  loadAndRegisterSheet: (uri) => registered.add(uri.spec),
  unregisterSheet: (uri) => registered.delete(uri.spec),
};
const context = vm.createContext({
  window: { windowUtils: { outerWindowID: 1 } },
  document: {
    documentElement: {
      removeAttribute: () => {},
      style: { removeProperty: () => {} },
    },
  },
  console,
  Services: {
    prefs,
    dirsvc: { get: () => ({ path: "profile/chrome" }) },
    io: { newURI: (spec) => ({ spec }) },
  },
  IOUtils: { readJSON: async () => preferences },
  PathUtils: { join: (...parts) => parts.join("/") },
  Cc: {
    "@mozilla.org/content/style-sheet-service;1": { getService: () => sheets },
  },
  Ci: {},
  CSS: {
    supports: (_property, value) => !!value && !value.includes("invalid"),
  },
  encodeURIComponent,
});
vm.runInContext(
  script.replace(
    "// Register Nebula Modules",
    "globalThis.Polyfill = NebulaPolyfillModule; return; // Register Nebula Modules",
  ),
  context,
);
context.Nebula = context.window.Nebula;
const polyfill = new context.Polyfill();
await polyfill.ensureRuntimePrefs();
assert.equal(defaults.size, fields.length - 1); // Zen owns its window-control preference.
assert.equal(saved.get("var-nebula-border-radius"), "21px");
assert.equal(saved.get("nebula-ui-font"), "poppins");
assert.ok(!defaults.has("zen.view.experimental-force-window-controls-left"));
polyfill.syncConfigVariables();
assert.equal(registered.size, 1);
let sheet = decodeURIComponent([...registered][0]);
assert.ok(sheet.includes("--var-nebula-border-radius: 21px"));
assert.ok(sheet.includes('url-prefix("about:preferences")'));
assert.ok(sheet.includes("--var-nebula-color-glass-dark: rgb(40 50 60 / 50%)"));
saved.set("var-nebula-border-radius", "invalid");
polyfill.syncConfigVariables();
assert.equal(registered.size, 1);
sheet = decodeURIComponent([...registered][0]);
assert.ok(sheet.includes("--var-nebula-border-radius: 13px"));
assert.equal(saved.get("var-nebula-border-radius"), "invalid");
polyfill._destroyed = true;
polyfill.syncConfigVariables();
assert.equal(registered.size, 1);
polyfill.destroy();
assert.equal(
  registered.size,
  0,
  "Theme teardown must unregister its CSS bridge",
);

saved.clear();
defaults.clear();
const fresh = new context.Polyfill();
await fresh.ensureRuntimePrefs();
assert.equal(defaults.size, fields.length - 1);
for (const field of fields.filter((field) =>
  /^(?:var-)?nebula-/.test(field.property),
)) {
  assert.equal(
    defaults.get(field.property),
    field.defaultValue,
    field.property,
  );
}
saved.set("nebula-ui-font", 3);
saved.set("var-nebula-ui-font-custom", "Cascadia Code");
fresh._migrateUiFontPref(prefs);
assert.equal(saved.get("nebula-ui-font"), "inter");
assert.equal(saved.get("nebula-ui-font-custom"), "Cascadia Code");
assert.equal(saved.get("nebula-ui-font-custom-enable"), true);
assert.ok(!saved.has("var-nebula-ui-font-custom"));

// Sample the browser's rendered favicon, including remotely decoded SVGs.
// A second image load is deliberately unavailable in this fixture.
const glowStyles = new Map();
fresh.root.style = {
  setProperty: (name, value) => glowStyles.set(name, value),
  removeProperty: (name) => glowStyles.delete(name),
};
const glowTimers = new Map();
let glowTimerId = 0;
context.setTimeout = (callback, delay) => {
  const id = ++glowTimerId;
  glowTimers.set(id, { callback, delay });
  return id;
};
context.clearTimeout = (id) => glowTimers.delete(id);
let drawnIcon;
context.document.createElementNS = (namespace, name) => {
  assert.equal(namespace, "http://www.w3.org/1999/xhtml");
  assert.equal(name, "canvas");
  return {
    getContext: () => ({
      clearRect: () => {},
      drawImage: (icon) => {
        assert.ok(icon.complete && icon.naturalWidth > 0);
        drawnIcon = icon;
      },
      getImageData: () => ({ data: drawnIcon.pixels }),
    }),
  };
};
function faviconTab(url, pixels, ready = true) {
  const listeners = new Map();
  const iconImage = {
    complete: ready,
    naturalWidth: ready ? 16 : 0,
    pixels: new Uint8ClampedArray(pixels),
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: (event) => listeners.delete(event),
    emit: (event) => listeners.get(event)?.(),
  };
  return { iconImage, getAttribute: () => url, listeners };
}
const redTab = faviconTab("moz-remote-image://red-svg", [240, 60, 60, 255]);
const blueTab = faviconTab("data:image/png;base64,blue", [60, 100, 240, 255]);
context.gBrowser = { selectedTab: redTab };
context.window.gBrowser = context.gBrowser;
saved.set("nebula-active-tab-glow", 2);
async function runGlowTimer(delay = 100) {
  const entry = [...glowTimers].find(([, timer]) => timer.delay === delay);
  assert.ok(entry, `Missing ${delay}ms favicon timer`);
  glowTimers.delete(entry[0]);
  return entry[1].callback();
}
await fresh.updateFaviconColor();
await runGlowTimer();
assert.equal(
  glowStyles.get("--nebula-selected-favicon-color"),
  "rgb(240, 60, 60)",
);
assert.equal(drawnIcon, redTab.iconImage);
context.gBrowser.selectedTab = blueTab;
await fresh.updateFaviconColor({ type: "TabSelect" });
await runGlowTimer();
assert.equal(
  glowStyles.get("--nebula-selected-favicon-color"),
  "rgb(60, 100, 240)",
);

const pendingTab = faviconTab(
  "moz-remote-image://pending-svg",
  [60, 240, 80, 255],
  false,
);
context.gBrowser.selectedTab = pendingTab;
await fresh.updateFaviconColor({ type: "TabSelect" });
const pendingGlow = runGlowTimer();
await fresh.updateFaviconColor({
  type: "TabAttrModified",
  target: redTab,
  detail: { changed: ["image"] },
});
assert.equal(
  glowTimers.size,
  1,
  "Background icons must not restart the selected icon's load",
);
context.gBrowser.selectedTab = redTab;
await fresh.updateFaviconColor({ type: "TabSelect" });
await pendingGlow;
assert.equal(
  pendingTab.listeners.size,
  0,
  "Old icon listeners must be removed",
);
await runGlowTimer();
assert.equal(
  glowStyles.get("--nebula-selected-favicon-color"),
  "rgb(240, 60, 60)",
);

context.gBrowser.selectedTab = pendingTab;
await fresh.updateFaviconColor({ type: "TabSelect" });
const disabledGlow = runGlowTimer();
saved.set("nebula-active-tab-glow", 0);
await fresh.updateFaviconColor();
await disabledGlow;
assert.ok(!glowStyles.has("--nebula-selected-favicon-color"));
assert.equal(glowTimers.size, 0);
assert.equal(pendingTab.listeners.size, 0);

saved.set("nebula-active-tab-glow", 2);
await fresh.updateFaviconColor();
const loadedGlow = runGlowTimer();
pendingTab.iconImage.complete = true;
pendingTab.iconImage.naturalWidth = 16;
pendingTab.iconImage.emit("load");
await loadedGlow;
assert.equal(
  glowStyles.get("--nebula-selected-favicon-color"),
  "rgb(60, 240, 80)",
);
assert.equal(pendingTab.listeners.size, 0);
assert.equal(glowTimers.size, 0);

const highlightedTab = faviconTab(
  "moz-remote-image://blue-white-svg",
  [0, 0, 255, 255, 255, 255, 255, 255],
);
context.gBrowser.selectedTab = highlightedTab;
await fresh.updateFaviconColor();
await runGlowTimer();
assert.equal(
  glowStyles.get("--nebula-selected-favicon-color"),
  "rgb(0, 0, 255)",
  "White highlights must not replace a colored favicon's glow",
);

pendingTab.iconImage.complete = false;
pendingTab.iconImage.naturalWidth = 0;
context.gBrowser.selectedTab = pendingTab;
await fresh.updateFaviconColor();
const failedGlow = runGlowTimer();
pendingTab.iconImage.emit("error");
await failedGlow;
assert.ok(!glowStyles.has("--nebula-selected-favicon-color"));
assert.equal(pendingTab.listeners.size, 0);
assert.equal(glowTimers.size, 0);

await fresh.updateFaviconColor();
const timedOutGlow = runGlowTimer();
await runGlowTimer(3000);
await timedOutGlow;
assert.equal(pendingTab.listeners.size, 0);
assert.equal(glowTimers.size, 0);

await fresh.updateFaviconColor();
const destroyedGlow = runGlowTimer();
fresh.destroy();
await destroyedGlow;
assert.ok(!glowStyles.has("--nebula-selected-favicon-color"));
assert.equal(pendingTab.listeners.size, 0);
assert.equal(glowTimers.size, 0);
console.log(
  `Validated ${fields.length} preferences, all dropdown variants, metadata, runtime defaults/CSS bridge and favicon glow lifecycle.`,
);

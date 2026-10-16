import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { cssPredicateManifest } from "./css-predicate-cache.mjs";

test("unique predicates have stable markers without changing source CSS", () => {
  const source = "main:has(*) {} main:not(:has(*)) {} body:has(.home) {}";
  const manifest = cssPredicateManifest(source);
  assert.deepEqual(manifest.map(({ selector, attribute }) => ({ selector, attribute })), [
    { selector: ":has(*)", attribute: "data-dream-has-0" },
    { selector: ":has(.home)", attribute: "data-dream-has-1" },
  ]);
  assert.equal(manifest[0].replacement, ":is(:where([data-dream-has-0]), :is(* *):not(*))");
  assert.equal(source, "main:has(*) {} main:not(:has(*)) {} body:has(.home) {}");
});

test("specificity carrier retains ID, class, type and nested functional arguments", () => {
  for (const argument of ["*", "#home", ".home", "main", ":is(#home, .home) > article:not(.hidden)"]) {
    const [predicate] = cssPredicateManifest(`body:has(${argument}) { color: red; }`);
    assert.equal(predicate.replacement,
      `:is(:where([data-dream-has-0]), :is(* ${argument}):not(*))`);
    // Added *, :where(marker), and :not(*) all contribute zero specificity;
    // :is(argument) uses the same maximum branch specificity as :has(argument).
    assert.ok(!predicate.replacement.includes(":has("));
  }
});

test("relative lists split only on top-level commas", () => {
  const argument = '> [data-label="a,b)"]:is(.a, .b), + section, ~ aside';
  const [predicate] = cssPredicateManifest(`main:has(${argument}) {}`);
  assert.equal(predicate.replacement,
    ':is(:where([data-dream-has-0]), :is(* > [data-label="a,b)"]:is(.a, .b), * + section, * ~ aside):not(*))');
  assert.deepEqual(predicate.branches, [
    { selector: '[data-label="a,b)"]:is(.a, .b)', relation: "child" },
    { selector: "section", relation: "adjacent" },
    { selector: "aside", relation: "sibling" },
  ]);
  const [escaped] = cssPredicateManifest('main:has(.a\\,b, [data-x="a\\\"b,c"]) {}');
  assert.ok(escaped.replacement.includes('* .a\\,b, * [data-x="a\\\"b,c"]'));
});

test("comments and strings do not create executable predicates", () => {
  assert.deepEqual(cssPredicateManifest('/* :has(.fake) */ a { content: ":has(.fake)"; }'), []);
  const [predicate] = cssPredicateManifest('a:has(/* comma, */ > .real) {}');
  assert.equal(predicate.selector, ':has(/* comma, */ > .real)');
  assert.deepEqual(predicate.branches, [{ selector: ".real", relation: "child" }]);
});

test("leaf query metadata preserves complex chains and descendant relations", () => {
  const [predicate] = cssPredicateManifest('a:has(> section > .leaf, + aside .leaf, ~ article > .leaf, main .leaf) {}');
  assert.deepEqual(predicate.branches, [
    { selector: "section > .leaf", relation: "child" },
    { selector: "aside .leaf", relation: "adjacent" },
    { selector: "article > .leaf", relation: "sibling" },
    { selector: "main .leaf", relation: "descendant" },
  ]);
});

test("malformed or nested predicates fail compilation", () => {
  for (const source of ["a:has(", "a:has() {}", "a:has(.a,) {}", "a:has(>.a, +) {}",
    "a:has([x) {}", "a:has(.a { color:red; }", 'a:has([x="unterminated]) {}',
    "a:has(:is(.a, :has(.b))) {}", "/* unterminated"]) {
    assert.throws(() => cssPredicateManifest(source), undefined, source);
  }
});

test("current expanded platform CSS is supported and cacheable predicates are fully replaced", async () => {
  const css = await fs.readFile(new URL("../macos/assets/dream-skin.css", import.meta.url), "utf8");
  const manifest = cssPredicateManifest(css);
  assert.ok(manifest.length > 0);
  let optimized = css;
  for (const { selector, replacement } of manifest) optimized = optimized.replaceAll(selector, replacement);
  assert.deepEqual(cssPredicateManifest(optimized), []);
  assert.equal(new Set(manifest.map(({ attribute }) => attribute)).size, manifest.length);
});


test("mount-sensitive native predicates opt out without disabling other caching", () => {
  const native = ':has(/* dream-skin-native-has */ > .workspace > main.thread-pane)';
  const source = 'main' + native + '{} main:has(.normal) {}';
  const manifest = cssPredicateManifest(source);
  assert.deepEqual(manifest.map(p => p.selector), [':has(.normal)']);
  assert.equal(manifest[0].attribute, 'data-dream-has-0');
  assert.ok(source.includes(native));
  assert.throws(() => cssPredicateManifest('main:has(/* dream-skin-native-has */ >) {}'), /Malformed/);
  assert.throws(() => cssPredicateManifest('main:has(/* dream-skin-native-has */ .a:has(.b)) {}'), /Nested/);
});

test("generated Dot predicates stay native on both platforms before classification", async () => {
  for (const platform of ['macos', 'windows']) {
    const css = await fs.readFile(new URL('../' + platform + '/assets/dream-skin.css', import.meta.url), 'utf8');
    const manifest = cssPredicateManifest(css);
    assert.ok(css.includes(':has(/* dream-skin-native-has */ .messaging-root'));
    assert.ok(!manifest.some(p => p.selector.includes('messaging-root') || p.selector.includes('.message-bubble')));
    assert.ok(manifest.length > 0);
  }
});

test("native opt-out is local to its fragment, even with an identical cached argument", () => {
  const native = ':has(/* dream-skin-native-has */ .a)';
  const source = 'main' + native + '{} section:has(.a){} p:has(.b){}';
  let optimized = source;
  for (const p of cssPredicateManifest(source)) optimized = optimized.replaceAll(p.selector, p.replacement);
  assert.ok(optimized.includes(native));
  assert.ok(!optimized.includes(':has(.a)'));
  assert.ok(!optimized.includes(':has(.b)'));
  assert.equal(cssPredicateManifest('/* dream-skin-native-has */ p:has(.a){}').length, 1);
  assert.equal(cssPredicateManifest('p:has([title="/* dream-skin-native-has */"]){}').length, 1);
});

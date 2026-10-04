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

test("current expanded platform CSS is supported and executable has predicates are fully replaced", async () => {
  const css = await fs.readFile(new URL("../macos/assets/dream-skin.css", import.meta.url), "utf8");
  const manifest = cssPredicateManifest(css);
  assert.ok(manifest.length > 0);
  let optimized = css;
  for (const { selector, replacement } of manifest) optimized = optimized.replaceAll(selector, replacement);
  assert.deepEqual(cssPredicateManifest(optimized), []);
  assert.equal(new Set(manifest.map(({ attribute }) => attribute)).size, manifest.length);
});

// Build-time extraction only. Runtime replaces these exact selector fragments;
// it does not parse CSS, and the published CSS remains the canonical source.
export function cssPredicateManifest(css) {
  const predicates = new Map();
  let quote = null;
  let comment = false;
  for (let i = 0; i < css.length; i += 1) {
    const char = css[i];
    if (comment) {
      if (css.startsWith("*/", i)) { comment = false; i += 1; }
      continue;
    }
    if (char === "\\") { i += 1; continue; }
    if (quote) { if (char === quote) quote = null; continue; }
    if (css.startsWith("/*", i)) { comment = true; i += 1; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (!css.startsWith(":has(", i)) continue;

    const start = i;
    let branchStart = i + 5;
    const stack = [")"];
    const branches = [];
    let innerQuote = null;
    let innerComment = false;
    let closed = false;
    const addBranch = (end) => {
      const branch = css.slice(branchStart, end).trim();
      if (!branch || /^[>+~]\s*$/.test(branch) || /[>+~]\s*$/.test(branch)) {
        throw new Error("Malformed :has() relative selector branch");
      }
      branches.push(branch);
    };
    for (i += 5; i < css.length; i += 1) {
      const current = css[i];
      if (innerComment) {
        if (css.startsWith("*/", i)) { innerComment = false; i += 1; }
        continue;
      }
      if (current === "\\") { i += 1; continue; }
      if (innerQuote) { if (current === innerQuote) innerQuote = null; continue; }
      if (css.startsWith("/*", i)) { innerComment = true; i += 1; continue; }
      if (current === '"' || current === "'") { innerQuote = current; continue; }
      if (css.startsWith(":has(", i)) throw new Error("Nested :has() is unsupported");
      if (current === "(" || current === "[") stack.push(current === "(" ? ")" : "]");
      else if (current === ")" || current === "]") {
        if (stack.pop() !== current) throw new Error("Unbalanced :has() selector");
        if (!stack.length) { addBranch(i); closed = true; break; }
      } else if (current === "," && stack.length === 1) {
        addBranch(i);
        branchStart = i + 1;
      } else if (current === "{" || current === "}" || current === ";") {
        throw new Error("Malformed :has() selector boundary");
      }
    }
    if (!closed) throw new Error("Unclosed :has() selector");
    const selector = css.slice(start, i + 1);
    if (!predicates.has(selector)) {
      const attribute = `data-dream-has-${predicates.size}`;
      // :where(marker) adds no specificity. The impossible second branch
      // carries exactly :has()'s max argument specificity. Prefixing every
      // relative branch with * makes >, + and ~ valid complex selectors.
      const specificityBranch = branches.map((branch) => `* ${branch}`).join(", ");
      predicates.set(selector, {
        selector,
        attribute,
        branches: branches.map((branch) => {
          // Leading comments do not affect the relative combinator. Preserve
          // the remaining selector verbatim for the runtime leaf query.
          const relative = branch.replace(/^(?:\s|\/\*[\s\S]*?\*\/)+/, "");
          const combinator = /^[>+~]/.exec(relative)?.[0];
          return {
            selector: combinator ? relative.slice(1).trim() : relative,
            relation: ({ ">": "child", "+": "adjacent", "~": "sibling" })[combinator] ?? "descendant",
          };
        }),
        replacement: `:is(:where([${attribute}]), :is(${specificityBranch}):not(*))`,
      });
    }
  }
  if (quote || comment) throw new Error("Unclosed CSS string or comment");
  return [...predicates.values()];
}

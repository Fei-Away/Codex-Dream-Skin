const MAX_SAFE_CSS_BYTES = 256 * 1024;
const MAX_RULES = 128;
const MAX_DECLARATIONS = 512;
const MAX_VALUE_CHARACTERS = 512;
const RUNTIME_CASCADE_LAYER = "dreamskin-community";
const CORE_BACKGROUND_IMAGE_PARTS = new Set(["sidebar", "main", "home"]);

export const SAFE_CSS_PARTS = Object.freeze([
  "root",
  "sidebar",
  "main",
  "header",
  "home",
  "home-hero",
  "project-list",
  "thread",
  "message",
  "composer",
  "composer-toolbar",
  "dialog",
]);

export const SAFE_CSS_VARIABLES = Object.freeze([
  "--ds-theme-color-background",
  "--ds-theme-color-panel",
  "--ds-theme-color-panel-alt",
  "--ds-theme-color-accent",
  "--ds-theme-color-accent-alt",
  "--ds-theme-color-secondary",
  "--ds-theme-color-highlight",
  "--ds-theme-color-text",
  "--ds-theme-color-muted",
  "--ds-theme-color-line",
  "--ds-theme-font-family",
  "--ds-theme-font-scale",
  "--ds-theme-surface-opacity",
  "--ds-theme-surface-blur",
  "--ds-theme-surface-radius",
  "--ds-theme-surface-border-alpha",
  "--ds-theme-surface-shadow",
  "--ds-theme-image-focus-x",
  "--ds-theme-image-focus-y",
  "--ds-theme-image-zoom",
  "--ds-theme-image-dim",
  "--ds-theme-image-task-intensity",
  "--ds-theme-density-scale",
  "--ds-theme-motion-level",
]);

const COLOR_VARIABLES = new Set(SAFE_CSS_VARIABLES.filter((name) => name.includes("-color-")));
const PARTS = new Set(SAFE_CSS_PARTS);
const VARIABLES = new Set(SAFE_CSS_VARIABLES);
export const SAFE_CSS_STATES = Object.freeze(["hover", "focus-visible"]);
const STATES = new Set(SAFE_CSS_STATES);
const COLOR_PROPERTIES = new Set([
  "color",
  "background-color",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
]);
const WIDTH_PROPERTIES = new Set([
  "border-width",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
]);
const STYLE_PROPERTIES = new Set([
  "border-style",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
]);
const RADIUS_PROPERTIES = new Set([
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
]);
const SPACING_PROPERTIES = new Set(["gap", "row-gap", "column-gap"]);
const TRANSITION_TARGETS = new Set([
  ...COLOR_PROPERTIES,
  ...WIDTH_PROPERTIES,
  ...RADIUS_PROPERTIES,
  ...SPACING_PROPERTIES,
  "box-shadow",
  "opacity",
  "backdrop-filter",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
]);
const SAFE_PROPERTIES = new Set([
  ...TRANSITION_TARGETS,
  ...STYLE_PROPERTIES,
  "font-family",
  "transition-duration",
  "transition-property",
]);
const FORBIDDEN_CONTROL = /[\u0000-\u0008\u000b\u000e-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const NUMBER = "(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?|0?\\.[0-9]+";
const SIGNED_NUMBER = `-?(?:${NUMBER})`;
const HEX_COLOR = /^#[0-9a-f]{3}(?:[0-9a-f]|[0-9a-f]{3}(?:[0-9a-f]{2})?)?$/i;
const SIMPLE_SELECTOR = /^\[data-ds-part="([a-z]+(?:-[a-z]+)*)"\](?::([a-z-]+))?$/;
const PROPERTY_NAME = /^[a-z][a-z-]*$/;
const VAR_FUNCTION = /^var\(\s*(--[a-z0-9-]+)\s*\)$/;
const FILTER_FUNCTION = /^(blur|saturate|brightness|contrast)\(\s*(.+?)\s*\)$/i;
const SAFE_WHITESPACE = new Set(["\t", "\n", "\r", "\f", " "]);

export class SafeCssValidationError extends Error {
  constructor(code, message, line, column) {
    super(`${message} (${line}:${column})`);
    this.name = "SafeCssValidationError";
    this.code = code;
    this.line = line;
    this.column = column;
  }
}

function splitTopLevel(value, separator) {
  const output = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === separator && depth === 0) {
      output.push(value.slice(start, index).trim());
      start = index + 1;
    }
    if (depth < 0) return null;
  }
  if (depth !== 0) return null;
  output.push(value.slice(start).trim());
  return output;
}

function splitWhitespace(value) {
  const output = [];
  let start = -1;
  let depth = 0;
  for (let index = 0; index <= value.length; index += 1) {
    const char = value[index] ?? " ";
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    const whitespace = SAFE_WHITESPACE.has(char);
    if (start === -1 && !whitespace) start = index;
    if (start !== -1 && whitespace && depth === 0) {
      output.push(value.slice(start, index));
      start = -1;
    }
    if (depth < 0) return null;
  }
  return depth === 0 ? output : null;
}

function numeric(value, min, max, unit = "") {
  const pattern = new RegExp(`^(?:${SIGNED_NUMBER})${unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  if (!pattern.test(value)) return false;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

function zeroOrPx(value, min, max) {
  return value === "0" || numeric(value, min, max, "px");
}

function registeredVar(value, allowed = VARIABLES) {
  const match = value.match(VAR_FUNCTION);
  return Boolean(match && allowed.has(match[1]));
}

function colorChannel(value) {
  if (/%$/.test(value)) return numeric(value.slice(0, -1), 0, 100);
  return /^(?:0|[1-9][0-9]{0,2})$/.test(value) && Number(value) <= 255;
}

function alphaChannel(value) {
  if (/%$/.test(value)) return numeric(value.slice(0, -1), 0, 100);
  return numeric(value, 0, 1);
}

function colorValue(value, property) {
  if (registeredVar(value, COLOR_VARIABLES)) return true;
  if (HEX_COLOR.test(value)) return true;
  const keyword = value.toLowerCase();
  if (keyword === "currentcolor") return true;
  if (keyword === "transparent") return property !== "color";
  const functionMatch = value.match(/^(rgb|rgba)\((.*)\)$/i);
  if (!functionMatch) return false;
  const components = splitTopLevel(functionMatch[2], ",");
  const expected = functionMatch[1].toLowerCase() === "rgb" ? 3 : 4;
  if (!components || components.length !== expected) return false;
  return components.slice(0, 3).every(colorChannel)
    && (expected === 3 || alphaChannel(components[3]));
}

function repeatedValues(value, minimum, maximum, validator) {
  const values = splitWhitespace(value);
  return Boolean(
    values
    && values.length >= minimum
    && values.length <= maximum
    && values.every(validator),
  );
}

function shadowValue(value) {
  if (value.toLowerCase() === "none") return true;
  const shadows = splitTopLevel(value, ",");
  if (!shadows || shadows.length < 1 || shadows.length > 2) return false;
  return shadows.every((shadow) => {
    const values = splitWhitespace(shadow);
    if (!values) return false;
    if (values[0]?.toLowerCase() === "inset") values.shift();
    if (values.length < 3 || values.length > 5) return false;
    const color = values.pop();
    if (!colorValue(color, "box-shadow")) return false;
    if (values.length < 2 || values.length > 4) return false;
    if (!zeroOrPx(values[0], -32, 32) || !zeroOrPx(values[1], -32, 32)) return false;
    if (values[2] !== undefined && !zeroOrPx(values[2], 0, 48)) return false;
    return values[3] === undefined || zeroOrPx(values[3], -8, 16);
  });
}

function fontFamilyValue(value) {
  const families = splitTopLevel(value, ",");
  const allowed = new Set([
    "system-ui",
    "-apple-system",
    "blinkmacsystemfont",
    "ui-sans-serif",
    "ui-rounded",
    "ui-serif",
    "ui-monospace",
    "sans-serif",
    "serif",
    "monospace",
  ]);
  return Boolean(families && families.length <= 4
    && families.every((family) => allowed.has(family.toLowerCase())));
}

function transitionDurationValue(value) {
  const durations = splitTopLevel(value, ",");
  return Boolean(durations && durations.length <= 4 && durations.every((duration) => {
    if (duration === "0") return true;
    if (/ms$/i.test(duration)) return numeric(duration.slice(0, -2), 0, 400);
    if (/s$/i.test(duration)) return numeric(duration.slice(0, -1), 0, 0.4);
    return false;
  }));
}

function transitionPropertyValue(value) {
  const properties = splitTopLevel(value, ",");
  return Boolean(properties && properties.length <= 4
    && properties.every((property) => TRANSITION_TARGETS.has(property.toLowerCase())));
}

function backdropFilterValue(value) {
  if (value.toLowerCase() === "none") return true;
  const filters = splitWhitespace(value);
  if (!filters || filters.length < 1 || filters.length > 4) return false;
  const seen = new Set();
  for (let index = 0; index < filters.length; index += 1) {
    const match = filters[index].match(FILTER_FUNCTION);
    if (!match) return false;
    const name = match[1].toLowerCase();
    const argument = match[2].trim();
    if (seen.has(name)) return false;
    seen.add(name);
    if (name === "blur") {
      if (index !== 0 || !(
        registeredVar(argument, new Set(["--ds-theme-surface-blur"]))
        || zeroOrPx(argument, 0, 30)
      )) return false;
    } else if (name === "saturate") {
      if (!numeric(argument, 0.5, 2)) return false;
    } else if (name === "brightness" || name === "contrast") {
      if (!numeric(argument, 0.8, 1.5)) return false;
    } else {
      return false;
    }
  }
  return seen.has("blur");
}

function validatePropertyValue(property, value) {
  if (COLOR_PROPERTIES.has(property)) return colorValue(value, property);
  if (WIDTH_PROPERTIES.has(property)) return repeatedValues(value, 1, 4, (item) => zeroOrPx(item, 0, 4));
  if (STYLE_PROPERTIES.has(property)) {
    return repeatedValues(value, 1, 4, (item) => ["none", "solid", "dashed", "dotted"].includes(item.toLowerCase()));
  }
  if (RADIUS_PROPERTIES.has(property)) {
    if (registeredVar(value, new Set(["--ds-theme-surface-radius"]))) return true;
    return repeatedValues(value, 1, 4, (item) => zeroOrPx(item, 0, 28));
  }
  if (SPACING_PROPERTIES.has(property)) return zeroOrPx(value, 0, 24);
  if (property === "box-shadow") return shadowValue(value);
  if (property === "opacity") {
    return registeredVar(value, new Set(["--ds-theme-surface-opacity"])) || numeric(value, 0.65, 1);
  }
  if (property === "backdrop-filter") return backdropFilterValue(value);
  if (property === "font-family") return fontFamilyValue(value);
  if (property === "font-size") return numeric(value, 12, 20, "px");
  if (property === "font-weight") return /^(?:400|500|600|700|normal|bold)$/i.test(value);
  if (property === "line-height") return numeric(value, 1.1, 1.8);
  if (property === "letter-spacing") return value === "0" || numeric(value, 0, 2, "px");
  if (property === "transition-duration") return transitionDurationValue(value);
  if (property === "transition-property") return transitionPropertyValue(value);
  return false;
}

class Parser {
  constructor(source) {
    this.source = source;
    this.index = 0;
    this.ruleCount = 0;
    this.declarationCount = 0;
    this.rules = [];
    this.lineStarts = [0];
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] === "\n") this.lineStarts.push(index + 1);
    }
  }

  position(offset = this.index) {
    let low = 0;
    let high = this.lineStarts.length;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if (this.lineStarts[middle] <= offset) low = middle;
      else high = middle;
    }
    return { line: low + 1, column: offset - this.lineStarts[low] + 1 };
  }

  fail(code, message, offset = this.index) {
    const { line, column } = this.position(offset);
    throw new SafeCssValidationError(code, message, line, column);
  }

  skipWhitespace() {
    while (this.index < this.source.length && /[\t\n\r\f ]/u.test(this.source[this.index])) {
      this.index += 1;
    }
  }

  parseSelector(prelude, offset) {
    const selectors = prelude.split(",");
    if (selectors.length !== 1) {
      this.fail("selector/list", "Safe CSS rules must contain exactly one registered selector", offset);
    }
    for (const rawSelector of selectors) {
      const selector = rawSelector.trim();
      const match = selector.match(SIMPLE_SELECTOR);
      if (!match || !PARTS.has(match[1]) || (match[2] && !STATES.has(match[2]))) {
        this.fail(
          "selector/unsupported",
          'Selectors must be an exact registered [data-ds-part="..."] with optional :hover or :focus-visible',
          offset + Math.max(0, prelude.indexOf(rawSelector)),
        );
      }
      return {
        part: match[1],
        selector,
        state: match[2] ?? null,
      };
    }
    return null;
  }

  parseRule() {
    const selectorOffset = this.index;
    while (this.index < this.source.length && this.source[this.index] !== "{") {
      const char = this.source[this.index];
      if (char === "}" || char === ";" || char === "@") {
        this.fail("syntax/rule", "Safe CSS accepts qualified rules only");
      }
      this.index += 1;
    }
    if (this.index >= this.source.length) this.fail("syntax/block", "Safe CSS rule is missing an opening brace", selectorOffset);
    const prelude = this.source.slice(selectorOffset, this.index).trim();
    if (!prelude) this.fail("selector/empty", "Safe CSS rule has an empty selector", selectorOffset);
    const selector = this.parseSelector(prelude, selectorOffset);
    this.index += 1;
    this.ruleCount += 1;
    if (this.ruleCount > MAX_RULES) this.fail("limit/rules", `Safe CSS exceeds ${MAX_RULES} rules`, selectorOffset);
    const declarations = this.parseDeclarations();
    this.rules.push({ selector, declarations });
  }

  parseDeclarations() {
    const seen = new Set();
    const declarations = [];
    let count = 0;
    while (true) {
      this.skipWhitespace();
      if (this.index >= this.source.length) this.fail("syntax/block", "Safe CSS rule is missing a closing brace");
      if (this.source[this.index] === "}") {
        if (count === 0) this.fail("declaration/empty", "Safe CSS rules must contain at least one declaration");
        this.index += 1;
        return declarations;
      }
      const propertyOffset = this.index;
      while (this.index < this.source.length && this.source[this.index] !== ":") {
        const char = this.source[this.index];
        if (char === ";" || char === "{" || char === "}" || char === "@" || char === "!") {
          this.fail("syntax/declaration", "Safe CSS declaration is missing a property/value separator");
        }
        this.index += 1;
      }
      if (this.index >= this.source.length) this.fail("syntax/declaration", "Safe CSS declaration is incomplete", propertyOffset);
      const property = this.source.slice(propertyOffset, this.index).trim().toLowerCase();
      if (!PROPERTY_NAME.test(property)) this.fail("property/name", "Safe CSS property name is invalid", propertyOffset);
      if (!SAFE_PROPERTIES.has(property)) this.fail("property/unsupported", `Safe CSS property is not allowed: ${property}`, propertyOffset);
      if (seen.has(property)) this.fail("property/duplicate", `Safe CSS rule repeats property: ${property}`, propertyOffset);
      seen.add(property);
      this.index += 1;
      const valueOffset = this.index;
      let depth = 0;
      while (this.index < this.source.length) {
        const char = this.source[this.index];
        if (char === "(") depth += 1;
        else if (char === ")") {
          depth -= 1;
          if (depth < 0) this.fail("syntax/function", "Safe CSS value has an unmatched closing parenthesis");
        } else if ((char === ";" || char === "}") && depth === 0) break;
        if (char === "{" || char === "[" || char === "]" || char === "@" || char === "!" || char === "\"" || char === "'") {
          this.fail("value/token", "Safe CSS value contains a forbidden token");
        }
        this.index += 1;
      }
      if (depth !== 0) this.fail("syntax/function", "Safe CSS value has an unclosed function", valueOffset);
      const value = this.source.slice(valueOffset, this.index).trim();
      if (!value) this.fail("value/empty", `Safe CSS property has an empty value: ${property}`, valueOffset);
      if (value.length > MAX_VALUE_CHARACTERS) {
        this.fail(
          "limit/value",
          `Safe CSS declaration value exceeds ${MAX_VALUE_CHARACTERS} characters`,
          valueOffset,
        );
      }
      if (!validatePropertyValue(property, value)) {
        this.fail("value/unsupported", `Safe CSS value is not allowed for ${property}`, valueOffset);
      }
      declarations.push({ property, value });
      count += 1;
      this.declarationCount += 1;
      if (this.declarationCount > MAX_DECLARATIONS) {
        this.fail("limit/declarations", `Safe CSS exceeds ${MAX_DECLARATIONS} declarations`, propertyOffset);
      }
      if (this.source[this.index] === ";") this.index += 1;
    }
  }

  parse() {
    this.skipWhitespace();
    while (this.index < this.source.length) {
      this.parseRule();
      this.skipWhitespace();
    }
    if (this.ruleCount === 0) this.fail("stylesheet/empty", "Safe CSS must contain at least one rule", 0);
    return {
      ruleCount: this.ruleCount,
      declarationCount: this.declarationCount,
      rules: this.rules,
    };
  }
}

function parseSafeCss(source, options = {}) {
  if (typeof source !== "string") {
    throw new TypeError("Safe CSS source must be a string");
  }
  const maxBytes = options.maxBytes ?? MAX_SAFE_CSS_BYTES;
  const bytes = new TextEncoder().encode(source).length;
  if (bytes < 1 || bytes > maxBytes) {
    throw new SafeCssValidationError(
      "limit/bytes",
      `Safe CSS must be between 1 and ${maxBytes} UTF-8 bytes`,
      1,
      1,
    );
  }
  const forbidden = source.search(FORBIDDEN_CONTROL);
  if (forbidden !== -1) {
    const parser = new Parser(source);
    parser.fail("syntax/control", "Safe CSS contains a forbidden control character", forbidden);
  }
  const comment = source.indexOf("/*");
  if (comment !== -1 || source.includes("*/")) {
    const parser = new Parser(source);
    parser.fail("syntax/comment", "Safe CSS comments are not allowed", comment === -1 ? source.indexOf("*/") : comment);
  }
  const escape = source.indexOf("\\");
  if (escape !== -1) {
    const parser = new Parser(source);
    parser.fail("syntax/escape", "Safe CSS escapes are not allowed", escape);
  }
  const parser = new Parser(source);
  return { bytes, ...parser.parse() };
}

function validationResult(parsed) {
  return Object.freeze({
    contract: "dreamskin-safe-css/1",
    status: "validated",
    bytes: parsed.bytes,
    ruleCount: parsed.ruleCount,
    declarationCount: parsed.declarationCount,
  });
}

function compileRuntimeCss(parsed) {
  const compiledRules = [];
  for (const { selector: selectorRecord, declarations } of parsed.rules) {
    const { part, selector } = selectorRecord;
    const runtimeDeclarations = [];
    for (const declaration of declarations) {
      runtimeDeclarations.push(declaration);
      if (
        declaration.property === "background-color"
        && CORE_BACKGROUND_IMAGE_PARTS.has(part)
      ) {
        runtimeDeclarations.push({ property: "background-image", value: "none" });
      }
    }
    const body = runtimeDeclarations
      .map(({ property, value }) => `    ${property}: ${value} !important;`)
      .join("\n");
    compiledRules.push(`  ${selector} {\n${body}\n  }`);

    if (part === "root") {
      const bodyDeclarations = [];
      for (const declaration of declarations) {
        if (![
          "background-color", "color", "font-family", "font-size", "font-weight",
          "letter-spacing", "line-height",
        ].includes(declaration.property)) continue;
        bodyDeclarations.push(declaration);
      }
      if (bodyDeclarations.length > 0) {
        const bodyBridge = bodyDeclarations
          .map(({ property, value }) => `    ${property}: ${value} !important;`)
          .join("\n");
        compiledRules.push(`  ${selector} body {\n${bodyBridge}\n  }`);
      }
    }

    const toolbarColor = part === "composer-toolbar"
      ? declarations.find(({ property }) => property === "color") : null;
    if (toolbarColor) {
      const controls = `${selector} :where(button:not([class~="bg-token-foreground"]), ` +
        `button:not([class~="bg-token-foreground"]) *)`;
      compiledRules.push(`  ${controls} {\n    color: ${toolbarColor.value} !important;\n  }`);
    }
  }
  const rules = compiledRules.join("\n");
  return `@layer ${RUNTIME_CASCADE_LAYER} {\n${rules}\n}\n`;
}

export function validateSafeCss(source, options = {}) {
  return validationResult(parseSafeCss(source, options));
}

export function compileSafeCss(source, options = {}) {
  return compileRuntimeCss(parseSafeCss(source, options));
}

export function decodeAndValidateSafeCss(bytes, options = {}) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Safe CSS bytes must be a Uint8Array");
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new SafeCssValidationError("syntax/utf8", "Safe CSS is not valid UTF-8", 1, 1);
  }
  const parsed = parseSafeCss(source, options);
  return {
    source,
    runtimeSource: compileRuntimeCss(parsed),
    validation: validationResult(parsed),
  };
}

export const SAFE_CSS_CONTRACT = Object.freeze({
  contract: "dreamskin-safe-css/1",
  maxBytes: MAX_SAFE_CSS_BYTES,
  maxRules: MAX_RULES,
  maxDeclarations: MAX_DECLARATIONS,
  maxValueCharacters: MAX_VALUE_CHARACTERS,
  parts: SAFE_CSS_PARTS,
  states: SAFE_CSS_STATES,
  variables: SAFE_CSS_VARIABLES,
  properties: Object.freeze([...SAFE_PROPERTIES].sort()),
});

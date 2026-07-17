function resolveRef(root, reference) {
  if (!reference.startsWith("#/")) throw new Error(`Unsupported schema reference: ${reference}`);
  return reference.slice(2).split("/").reduce((value, segment) => (
    value[segment.replaceAll("~1", "/").replaceAll("~0", "~")]
  ), root);
}

function isType(value, type) {
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

export function jsonSchemaErrors(root, value, schema = root, path = "$") {
  const errors = [];
  if (schema.$ref) return jsonSchemaErrors(root, value, resolveRef(root, schema.$ref), path);
  for (const member of schema.allOf ?? []) errors.push(...jsonSchemaErrors(root, value, member, path));
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((member) => jsonSchemaErrors(root, value, member, path).length === 0);
    if (matches.length !== 1) errors.push(`${path} must match exactly one oneOf member`);
  }
  if (schema.type && !isType(value, schema.type)) {
    errors.push(`${path} must be ${schema.type}`);
    return errors;
  }
  if (schema.const !== undefined && !Object.is(value, schema.const)) errors.push(`${path} must equal const`);
  if (schema.enum && !schema.enum.some((candidate) => Object.is(value, candidate))) errors.push(`${path} is not in enum`);

  if (typeof value === "string") {
    const length = Array.from(value).length;
    if (schema.minLength !== undefined && length < schema.minLength) errors.push(`${path} is too short`);
    if (schema.maxLength !== undefined && length > schema.maxLength) errors.push(`${path} is too long`);
    if (schema.pattern && !(new RegExp(schema.pattern, "u")).test(value)) errors.push(`${path} fails pattern`);
    if (schema.format === "uri") {
      try {
        new URL(value);
      } catch {
        errors.push(`${path} is not a URI`);
      }
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} is below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} exceeds maximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} has too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} has too many items`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      errors.push(`${path} items are not unique`);
    }
    if (schema.items) {
      value.forEach((item, index) => errors.push(...jsonSchemaErrors(root, item, schema.items, `${path}[${index}]`)));
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) errors.push(`${path}.${required} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties ?? {}, key)) errors.push(`${path}.${key} is unknown`);
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) {
        errors.push(...jsonSchemaErrors(root, value[key], childSchema, `${path}.${key}`));
      }
    }
  }
  return errors;
}

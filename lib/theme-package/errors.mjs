export class ThemePackageError extends Error {
  constructor(code, message, field = null, persistentChanges = false) {
    super(message);
    this.name = "ThemePackageError";
    this.code = code;
    this.field = field;
    this.persistentChanges = persistentChanges;
  }
}

export function fail(code, message, field = null, persistentChanges = false) {
  throw new ThemePackageError(code, message, field, persistentChanges);
}

export class ThemePackageError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = "ThemePackageError";
    this.code = code;
    this.field = field;
  }
}

export function fail(code, message, field = null) {
  throw new ThemePackageError(code, message, field);
}

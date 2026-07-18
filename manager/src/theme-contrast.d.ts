export interface ParsedThemeColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface ThemeContrastColors {
  background: string;
  panel: string;
  panelAlt: string;
  accent: string;
  accentAlt: string;
  secondary: string;
  highlight: string;
  text: string;
  muted: string;
  line: string;
}

export type ThemeContrastField = "text" | "muted" | "accent" | "accentAlt";
export type ThemeContrastSurface = "background" | "panel" | "panelAlt";

export interface ThemeContrastSurfaceFailure {
  surface: ThemeContrastSurface;
  surfaceLabel: string;
  ratio: number;
}

export interface ThemeContrastIssue {
  field: ThemeContrastField;
  minimum: number;
  surface: ThemeContrastSurface;
  surfaceLabel: string;
  ratio: number;
  failedSurfaces: ThemeContrastSurfaceFailure[];
  suggestedColor: ParsedThemeColor | null;
}

export function parseThemeColor(value: unknown): ParsedThemeColor | null;
export function themeContrastIssues(colors: ThemeContrastColors): ThemeContrastIssue[];

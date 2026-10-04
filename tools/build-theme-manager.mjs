#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(process.env.DOTNET || "dotnet", [
  "publish", path.join(root, "windows/theme-manager/App/DreamSkin.ThemeManager.csproj"),
  "-c", "Release", "-r", "win-x64", "--self-contained", "true",
  "-p:PublishSingleFile=true", "-p:IncludeNativeLibrariesForSelfExtract=true",
  "-p:DebugType=None", "-p:DebugSymbols=false",
  "-o", path.join(root, "windows/assets/theme-manager"),
], { cwd: root, stdio: "inherit", shell: false });
if (result.error) console.error(`Unable to run .NET SDK: ${result.error.message}`);
process.exit(result.status ?? 1);

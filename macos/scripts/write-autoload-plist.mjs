import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);

function valueFor(name) {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? args[index + 1] : "";
  if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
  return value;
}

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function stringItem(value) {
  return `        <string>${xml(value)}</string>`;
}

const output = path.resolve(valueFor("output"));
const label = valueFor("label");
const supervisor = path.resolve(valueFor("supervisor"));
const stdout = path.resolve(valueFor("stdout"));
const stderr = path.resolve(valueFor("stderr"));

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${xml(label)}</string>
    <key>ProgramArguments</key>
    <array>
${stringItem(supervisor)}
        <string>--daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>LimitLoadToSessionType</key>
    <string>Aqua</string>
    <key>ThrottleInterval</key>
    <integer>5</integer>
    <key>StandardOutPath</key>
    <string>${xml(stdout)}</string>
    <key>StandardErrorPath</key>
    <string>${xml(stderr)}</string>
</dict>
</plist>
`;

await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
const temporary = `${output}.${process.pid}.tmp`;
try {
  await fs.writeFile(temporary, plist, { mode: 0o600 });
  await fs.rename(temporary, output);
  await fs.chmod(output, 0o600);
} finally {
  await fs.rm(temporary, { force: true }).catch(() => {});
}

console.log(`Wrote ${output}`);

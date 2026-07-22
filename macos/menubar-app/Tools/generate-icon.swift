import AppKit
import Foundation

guard CommandLine.arguments.count == 2 else {
  fputs("Usage: generate-icon.swift <output.png>\n", stderr)
  exit(2)
}

let pixels = 1024
guard let bitmap = NSBitmapImageRep(
  bitmapDataPlanes: nil,
  pixelsWide: pixels,
  pixelsHigh: pixels,
  bitsPerSample: 8,
  samplesPerPixel: 4,
  hasAlpha: true,
  isPlanar: false,
  colorSpaceName: .deviceRGB,
  bytesPerRow: 0,
  bitsPerPixel: 0
) else {
  fputs("Could not create icon bitmap.\n", stderr)
  exit(1)
}
bitmap.size = NSSize(width: pixels, height: pixels)
NSGraphicsContext.saveGraphicsState()
guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
  fputs("Could not create icon graphics context.\n", stderr)
  exit(1)
}
NSGraphicsContext.current = context

let canvas = NSRect(x: 48, y: 48, width: 928, height: 928)
let background = NSBezierPath(roundedRect: canvas, xRadius: 220, yRadius: 220)
let gradient = NSGradient(colors: [
  NSColor(calibratedRed: 0.18, green: 0.28, blue: 0.72, alpha: 1),
  NSColor(calibratedRed: 0.53, green: 0.25, blue: 0.76, alpha: 1),
  NSColor(calibratedRed: 0.95, green: 0.37, blue: 0.48, alpha: 1)
])!
gradient.draw(in: background, angle: -42)

NSColor(calibratedWhite: 0, alpha: 0.18).setFill()
NSBezierPath(ovalIn: NSRect(x: 202, y: 176, width: 650, height: 650)).fill()

NSColor(calibratedWhite: 1, alpha: 0.96).setFill()
let palette = NSBezierPath()
palette.appendOval(in: NSRect(x: 190, y: 210, width: 650, height: 650))
palette.appendOval(in: NSRect(x: 568, y: 232, width: 210, height: 180))
palette.windingRule = .evenOdd
palette.fill()

let colors: [(NSColor, NSRect)] = [
  (NSColor(calibratedRed: 0.20, green: 0.45, blue: 0.96, alpha: 1), NSRect(x: 330, y: 620, width: 112, height: 112)),
  (NSColor(calibratedRed: 0.28, green: 0.76, blue: 0.62, alpha: 1), NSRect(x: 480, y: 670, width: 112, height: 112)),
  (NSColor(calibratedRed: 0.98, green: 0.71, blue: 0.23, alpha: 1), NSRect(x: 635, y: 596, width: 112, height: 112)),
  (NSColor(calibratedRed: 0.95, green: 0.34, blue: 0.45, alpha: 1), NSRect(x: 286, y: 450, width: 112, height: 112))
]
for (color, rect) in colors {
  color.setFill()
  NSBezierPath(ovalIn: rect).fill()
}

let brush = NSBezierPath(roundedRect: NSRect(x: 485, y: 182, width: 90, height: 390), xRadius: 45, yRadius: 45)
var transform = AffineTransform()
transform.translate(x: 530, y: 377)
transform.rotate(byDegrees: -34)
transform.translate(x: -530, y: -377)
brush.transform(using: transform)
NSColor(calibratedRed: 0.18, green: 0.20, blue: 0.30, alpha: 0.94).setFill()
brush.fill()

context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()

guard let data = bitmap.representation(using: .png, properties: [:]) else {
  fputs("Could not encode icon PNG.\n", stderr)
  exit(1)
}
do {
  try data.write(to: URL(fileURLWithPath: CommandLine.arguments[1]), options: .atomic)
} catch {
  fputs("Could not write icon: \(error.localizedDescription)\n", stderr)
  exit(1)
}

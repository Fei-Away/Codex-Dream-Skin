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

// DreamSkin 品牌 mark，与 dreamskin.cc 的 favicon 同源：白底圆角方 +
// 发丝描边 + 墨色对角三角 + 青色圆点。坐标取自 32 栅格 favicon ×32
//（AppKit 坐标系原点在左下，Y 轴与 SVG 相反，已做镜像换算）。
let canvas = NSRect(x: 64, y: 64, width: 896, height: 896)
let cornerRadius: CGFloat = 288
let background = NSBezierPath(roundedRect: canvas, xRadius: cornerRadius, yRadius: cornerRadius)
let paper = NSColor(calibratedRed: 0.992, green: 0.992, blue: 0.988, alpha: 1) // #fdfdfc
let ink = NSColor(calibratedRed: 0.090, green: 0.094, blue: 0.110, alpha: 1) // #17181c
let teal = NSColor(calibratedRed: 0.176, green: 0.882, blue: 0.761, alpha: 1) // #2de1c2

paper.setFill()
background.fill()

NSGraphicsContext.current?.saveGraphicsState()
background.addClip()
ink.setFill()
let diagonal = NSBezierPath()
diagonal.move(to: NSPoint(x: 64, y: 64))
diagonal.line(to: NSPoint(x: 960, y: 960))
diagonal.line(to: NSPoint(x: 960, y: 64))
diagonal.close()
diagonal.fill()
NSGraphicsContext.current?.restoreGraphicsState()

ink.withAlphaComponent(0.14).setStroke()
background.lineWidth = 32
background.stroke()

teal.setFill()
NSBezierPath(ovalIn: NSRect(x: 656, y: 656, width: 160, height: 160)).fill()

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

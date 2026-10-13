/** Wry 0.57 reports Cocoa points on macOS, despite Tauri's PhysicalPosition
 * label. Other desktop backends report physical pixels. Keep this conversion
 * separate so Retina changes cannot silently redirect a file to another card.
 */
export function fileDropPoint(
  point: { x: number; y: number },
  platform: string,
  pixelRatio: number,
): { x: number; y: number } {
  const scale = /mac/i.test(platform) ? 1 : Math.max(1, pixelRatio || 1);
  return { x: point.x / scale, y: point.y / scale };
}

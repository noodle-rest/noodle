import { ScrollBoxRenderable, type CliRenderer } from "@opentui/core"

export function clipViewportCursor(renderer: CliRenderer): void {
  const editor = renderer.currentFocusedEditor
  if (!editor?.showCursor) return
  const cursor = editor.visualCursor
  const x = editor.screenX + cursor.visualCol + 1
  const y = editor.screenY + cursor.visualRow + 1
  for (let ancestor = editor.parent; ancestor; ancestor = ancestor.parent) {
    if (!(ancestor instanceof ScrollBoxRenderable)) continue
    const viewport = ancestor.viewport
    if (
      x <= viewport.screenX ||
      x > viewport.screenX + viewport.width ||
      y <= viewport.screenY ||
      y > viewport.screenY + viewport.height
    ) {
      renderer.setCursorPosition(0, 0, false)
      return
    }
  }
}

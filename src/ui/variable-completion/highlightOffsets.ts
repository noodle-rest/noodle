import { measureEditText, type WidthMethod } from "@opentui/core"

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

export function buildCharToDisplayOffsets(
  content: string,
  widthMethod: WidthMethod = "unicode",
): number[] {
  const offsets = new Array<number>(content.length + 1)
  let displayOffset = 0

  for (const { segment, index } of graphemes.segment(content)) {
    for (let unit = 0; unit < segment.length; unit++)
      offsets[index + unit] = displayOffset
    displayOffset +=
      segment === "\t"
        ? 2
        : widthMethod === "wcwidth" && segment.codePointAt(0)! > 0x7f
          ? measureEditText(segment, { widthMethod })
          : Bun.stringWidth(segment)
  }

  offsets[content.length] = displayOffset
  return offsets
}

export function charOffsetToDisplayOffset(
  offsets: number[],
  offset: number,
): number {
  const clamped = Math.max(0, Math.min(offset, offsets.length - 1))
  return offsets[clamped] ?? offsets[offsets.length - 1] ?? 0
}

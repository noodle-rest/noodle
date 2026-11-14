import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { ResourceContext } from "@opentui/core"
import type {
  SimpleHighlight,
  SyntaxStyle,
  TreeSitterClient,
} from "@opentui/core"
import { opencodeTheme } from "../../src/ui/theme-data"
import { CodeEditorHighlightRenderer } from "../../src/ui/editor/codeEditorHighlightRenderer"
import type { EditorHighlightRange } from "../../src/ui/editor/codeEditorHighlighting"

let owner: ResourceContext
beforeEach(() => {
  owner = new ResourceContext({ objectCapacity: 1024, renderCellsMax: 1 })
})
afterEach(() => owner.destroy())

function createHost() {
  let style: SyntaxStyle | null | undefined
  const ranges: EditorHighlightRange[] = []

  return {
    host: {
      owner,
      widthMethod: "unicode" as const,
      clear: () => {
        ranges.length = 0
      },
      setStyle: (next: SyntaxStyle | null) => {
        style = next
      },
      applyRanges: (next: EditorHighlightRange[]) => {
        ranges.push(...next)
      },
    },
    ranges,
    getStyle: () => style,
  }
}

describe("CodeEditorHighlightRenderer", () => {
  it("releases replaced styles and its final style", () => {
    const { host, getStyle } = createHost()
    const renderer = new CodeEditorHighlightRenderer(
      opencodeTheme,
      undefined,
      host,
    )
    renderer.prepare()
    const previous = spyOn(getStyle()!, "destroy")
    renderer.setTheme({ ...opencodeTheme, primary: "#123456" })
    expect(previous).toHaveBeenCalledTimes(1)
    const current = spyOn(getStyle()!, "destroy")
    renderer.destroy()
    expect(current).toHaveBeenCalledTimes(1)
    expect(getStyle()).toBeNull()
  })

  it("drops replaced tokens and resets cached colors when the language changes", async () => {
    const { host, ranges } = createHost()
    const renderer = new CodeEditorHighlightRenderer(
      opencodeTheme,
      undefined,
      host,
    )
    const client = {
      highlightOnce: async () => ({
        highlights: [
          [1, 4, "tag"],
          [8, 12, "tag"],
        ],
      }),
    } as unknown as TreeSitterClient
    await renderer.highlight("<old/> <keep/>", "xml", client, () => true)
    renderer.apply("<replacement/> <keep/>", "xml")
    expect(ranges).toEqual([
      { start: 16, end: 20, styleId: ranges[0]!.styleId, priority: 1 },
    ])
    renderer.apply("<replacement/> <keep/>", "text")
    expect(ranges).toEqual([])
    renderer.apply("<replacement/> <keep/>", "xml")
    expect(ranges).toEqual([])
  })

  it("ignores a stale parser reply without replacing the current color cache", async () => {
    const { host, ranges } = createHost()
    const renderer = new CodeEditorHighlightRenderer(
      opencodeTheme,
      undefined,
      host,
    )
    const ready = {
      highlightOnce: async () => ({ highlights: [[1, 5, "tag"]] }),
    } as unknown as TreeSitterClient
    await renderer.highlight("<note/>", "xml", ready, () => true)
    const reply = Promise.withResolvers<{ highlights: SimpleHighlight[] }>()
    const pending = {
      highlightOnce: () => reply.promise,
    } as unknown as TreeSitterClient
    let current = true
    const refresh = renderer.highlight("<note/>", "xml", pending, () => current)
    current = false
    renderer.apply(" \n<note/>", "xml")
    const colors = [...ranges]
    reply.resolve({ highlights: [[0, 7, "error"]] })
    await refresh
    expect(ranges).toEqual(colors)
    renderer.apply("<note/>", "xml")
    expect(ranges).toEqual([
      { start: 1, end: 5, styleId: colors[0]!.styleId, priority: 1 },
    ])
    renderer.clear()
    renderer.apply("<note/>", "xml")
    expect(ranges).toEqual([])
  })

  it("uses JavaScript fallback styles when the parser fails", async () => {
    const { host, ranges, getStyle } = createHost()
    const renderer = new CodeEditorHighlightRenderer(
      opencodeTheme,
      undefined,
      host,
    )
    const client = {
      highlightOnce: async () => {
        throw new Error("parser unavailable")
      },
    } as unknown as TreeSitterClient
    await renderer.highlight(
      'const x = "hello"; // comment',
      "javascript",
      client,
      () => true,
    )
    expect(ranges.map((range) => range.styleId)).toEqual(
      ["keyword", "string", "comment"].map((kind) =>
        getStyle()!.getStyleId(kind)!,
      ),
    )
    expect(ranges[0]).toMatchObject({ start: 0, end: 5 })
  })

  it("applies the syntax style for XML Tree-sitter highlights", async () => {
    const { host, ranges, getStyle } = createHost()
    const renderer = new CodeEditorHighlightRenderer(
      opencodeTheme,
      undefined,
      host,
    )
    const client = {
      highlightOnce: async () => ({
        highlights: [
          [0, 1, "punctuation.delimiter"],
          [1, 5, "tag"],
        ],
      }),
    } as unknown as TreeSitterClient

    await renderer.highlight("<note>", "xml", client, () => true)

    const style = getStyle()!
    expect(style).toBeDefined()
    expect(ranges).toEqual([
      {
        start: 0,
        end: 1,
        styleId: style.getStyleId("punctuation.delimiter") ?? 0,
        priority: 1,
      },
      {
        start: 1,
        end: 5,
        styleId: style.getStyleId("tag") ?? 0,
        priority: 1,
      },
    ])
  })

  it("uses Tree-sitter highlights for JSON", async () => {
    const { host, ranges, getStyle } = createHost()
    const renderer = new CodeEditorHighlightRenderer(
      opencodeTheme,
      undefined,
      host,
    )
    const calls: Array<[string, string]> = []
    const client = {
      highlightOnce: async (content: string, filetype: string) => {
        calls.push([content, filetype])
        return {
          highlights: [
            [0, 1, "punctuation.bracket"],
            [4, 10, "property"],
            [12, 19, "string"],
          ],
        }
      },
    } as unknown as TreeSitterClient

    await renderer.highlight(
      '{\n  "name": "hello"\n}',
      "json",
      client,
      () => true,
    )

    const style = getStyle()!
    expect(calls).toEqual([['{\n  "name": "hello"\n}', "json"]])
    expect(ranges.slice(-3)).toEqual([
      {
        start: 0,
        end: 1,
        styleId: style.getStyleId("punctuation.bracket") ?? 0,
        priority: 1,
      },
      {
        start: 3,
        end: 9,
        styleId: style.getStyleId("property") ?? 0,
        priority: 1,
      },
      {
        start: 11,
        end: 18,
        styleId: style.getStyleId("string") ?? 0,
        priority: 1,
      },
    ])
  })

  it("keeps display offsets correct in JSON fallback highlights", async () => {
    const { host, ranges, getStyle } = createHost()
    const renderer = new CodeEditorHighlightRenderer(
      opencodeTheme,
      undefined,
      host,
    )
    const content = '{\n  "emoji": "hello 😊"\n}'
    const client = {
      highlightOnce: async () => {
        throw new Error("parser unavailable")
      },
    } as unknown as TreeSitterClient

    await renderer.highlight(content, "json", client, () => true)

    const stringStyleId = getStyle()!.getStyleId("json.string") ?? 0
    const stringRange = ranges.find(
      (range) => range.styleId === stringStyleId && range.start === 12,
    )

    expect(stringRange).toEqual({
      start: 12,
      end: 22,
      styleId: stringStyleId,
      priority: 1,
    })
  })

  it("keeps JSON fallback highlights when Tree-sitter returns partial output", async () => {
    const { host, ranges, getStyle } = createHost()
    const renderer = new CodeEditorHighlightRenderer(
      opencodeTheme,
      undefined,
      host,
    )
    const client = {
      highlightOnce: async () => ({
        highlights: [[0, 1, "punctuation.bracket"]],
      }),
    } as unknown as TreeSitterClient

    await renderer.highlight(
      '{\r\n  "name": "María 😊',
      "json",
      client,
      () => true,
    )

    expect(ranges).toContainEqual({
      start: 11,
      end: 20,
      styleId: getStyle()!.getStyleId("json.string") ?? 0,
      priority: 1,
    })
  })

  it("keeps YAML fallback highlights when Tree-sitter returns partial output", async () => {
    const { host, ranges, getStyle } = createHost()
    const renderer = new CodeEditorHighlightRenderer(
      opencodeTheme,
      undefined,
      host,
    )
    const client = {
      highlightOnce: async () => ({
        highlights: [[0, 5, "property"]],
      }),
    } as unknown as TreeSitterClient

    await renderer.highlight(
      'name: "María 😊\r\nnext: true',
      "yaml",
      client,
      () => true,
    )

    expect(ranges).toContainEqual({
      start: 6,
      end: 15,
      styleId: getStyle()!.getStyleId("yaml.text") ?? 0,
      priority: 1,
    })
  })
})

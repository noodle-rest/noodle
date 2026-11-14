import { describe, expect, it, spyOn } from "bun:test"
import { act } from "react"
import {
  InputRenderable,
  RGBA,
  type ScrollBoxRenderable,
  type TextareaRenderable,
} from "@opentui/core"
import {
  createTestRenderer,
  setRendererCapabilities,
} from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { highlightVariables } from "../../src/ui/variable-completion/variableHighlight"
import { opencodeTheme } from "../../src/ui/theme-data"

const testRender = createTestRender()

describe("OpenTUI native integration", () => {
  it.each(["input", "textarea"] as const)(
    "clips the cursor of a raw %s outside its scroll viewport",
    async (kind) => {
      let scroll!: ScrollBoxRenderable
      let editor!: InputRenderable | TextareaRenderable
      const h = await testRender(
        <scrollbox
          ref={(node) => {
            if (node) scroll = node
          }}
          height={3}
        >
          <box height={8} flexShrink={0} />
          {kind === "input" ? (
            <input
              ref={(node) => {
                if (node) editor = node
              }}
              value="abc"
            />
          ) : (
            <textarea
              ref={(node) => {
                if (node) editor = node
              }}
              initialValue="abc"
              height={1}
            />
          )}
        </scrollbox>,
        { width: 20, height: 3 },
      )
      await act(async () => {
        editor.focus()
        scroll.scrollTo(8)
        await h.renderOnce()
      })
      expect(h.captureSpans().cursor).not.toEqual([1, 1])
      scroll.scrollTo(0)
      await h.renderOnce()
      expect(h.captureSpans().cursor).toEqual([1, 1])
    },
  )

  it.each(["unicode", "wcwidth"] as const)(
    "reuses and releases variable styles with %s widths",
    async (unicode) => {
      const h = await createTestRenderer({ width: 20, height: 1 })
      try {
        setRendererCapabilities(h.renderer, { unicode })
        const input = new InputRenderable(h.renderer, { value: "👩‍💻$VAR" })
        h.renderer.root.add(input)
        const env = { name: "test", vars: { VAR: "ok" } }
        highlightVariables(input, input.plainText, opencodeTheme, env)
        const style = input.syntaxStyle!
        const destroy = spyOn(style, "destroy")
        for (let i = 0; i < 20; i++)
          highlightVariables(input, input.plainText, opencodeTheme, env)
        expect(input.syntaxStyle).toBe(style)
        expect(input.getLineHighlights(0)[0]!.start).toBe(
          unicode === "wcwidth" ? 4 : 2,
        )
        await h.renderOnce()
        const variable = h
          .captureSpans()
          .lines[0]!.spans.find((span) => span.text.includes("$VAR"))
        expect(variable?.fg.equals(RGBA.fromHex(opencodeTheme.primary))).toBe(
          true,
        )
        input.destroy()
        expect(destroy).toHaveBeenCalledTimes(1)
      } finally {
        await h.dispose()
      }
    },
  )
})

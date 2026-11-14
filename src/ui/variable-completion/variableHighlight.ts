import type { Environment, ParamEntry } from "../../schema"
import { SyntaxStyle } from "@opentui/core"
import type { InputRenderable, TextareaRenderable } from "@opentui/core"
import type { Theme } from "../theme-data"
import {
  getVariableHighlights,
  type BodyCompletion,
} from "./variableCompletion"
import { URL_PATH_TOKEN_RE } from "../../requests/pathParams"
import { isPathParamResolved } from "./envHighlight"
import {
  buildCharToDisplayOffsets,
  charOffsetToDisplayOffset,
} from "./highlightOffsets"

const variableStyles = new WeakMap<
  InputRenderable | TextareaRenderable,
  SyntaxStyle
>()

export function highlightVariables(
  input: InputRenderable | TextareaRenderable,
  value: string,
  theme: Theme,
  env: Environment | null,
  pathParams?: ParamEntry[],
  body?: BodyCompletion,
): void {
  let style = variableStyles.get(input)
  if (!style) {
    style = SyntaxStyle.create(input.ctx.nativeScene)
    variableStyles.set(input, style)
    input.once("destroyed", () => variableStyles.get(input)?.destroy())
  }
  for (const [name, fg] of Object.entries({
    "env.resolved": theme.primary,
    "env.missing": theme.error,
    "path.resolved": theme.primary,
    "path.missing": theme.error,
  }))
    style.registerStyle(name, { fg })
  input.clearAllHighlights()
  input.syntaxStyle = style
  const displayOffsets = buildCharToDisplayOffsets(value, input.ctx.widthMethod)

  for (const highlight of getVariableHighlights(value, env, body)) {
    input.addHighlightByCharRange({
      start: charOffsetToDisplayOffset(displayOffsets, highlight.start),
      end: charOffsetToDisplayOffset(displayOffsets, highlight.end),
      styleId: style.getStyleId(
        highlight.exists ? "env.resolved" : "env.missing",
      )!,
      priority: 2,
    })
  }

  const queryIdx = value.indexOf("?")
  const pathText = queryIdx === -1 ? value : value.slice(0, queryIdx)
  URL_PATH_TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = URL_PATH_TOKEN_RE.exec(pathText)) !== null) {
    const name = m[1]!
    const resolved = isPathParamResolved(name, pathParams ?? [])
    const colonIdx = m.index + (m[0][0] === "/" ? 1 : 0)
    input.addHighlightByCharRange({
      start: charOffsetToDisplayOffset(displayOffsets, colonIdx),
      end: charOffsetToDisplayOffset(displayOffsets, m.index + m[0].length),
      styleId: style.getStyleId(resolved ? "path.resolved" : "path.missing")!,
      priority: 2,
    })
  }
}

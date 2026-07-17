import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { loadConfig } from "../../config/index.js";
import type { ToolStepResult } from "../../cli/transcript-renderer.js";

/** Surrounding-file context an edit diff renders with, computed once from disk. */
export interface EditDiffContext {
  contextBefore: string[];
  contextAfter: string[];
  lineIndent: string;
  startLine: number;
}

/**
 * Read an edit's surrounding-file context from disk: the unchanged lines above
 * and below the matched `old_text`, the leading indent stripped onto its own
 * line, and the 1-based line number the diff starts rendering from. Degrades to
 * empty context (startLine 1) when the file is missing or the match isn't found —
 * the diff is a projection of the intended edit, not a guarantee it will apply.
 */
export function computeEditDiffContext(
  path: unknown,
  oldText: unknown,
): EditDiffContext {
  const contextBefore: string[] = [];
  const contextAfter: string[] = [];
  let lineIndent = "";
  let startLine = 1;
  if (typeof path === "string" && typeof oldText === "string") {
    try {
      const filePath = join(process.cwd(), path);
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
        const normalizedOld = oldText
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t")
          .replace(/\r\n/g, "\n");
        const idx = content.indexOf(normalizedOld);
        if (idx !== -1) {
          const beforeParts = content.slice(0, idx).split("\n");
          const partialLineStart = beforeParts.pop() ?? "";
          if (/^\s+$/.test(partialLineStart)) lineIndent = partialLineStart;
          const maxCtx = loadConfig().diffContextLines;
          for (
            let i = beforeParts.length - 1;
            i >= 0 && contextBefore.length < maxCtx;
            i--
          ) {
            if (/^\s*$/.test(beforeParts[i])) break;
            contextBefore.unshift(beforeParts[i]);
          }
          // First shown line = match's first line (beforeParts.length + 1)
          // walked back past the context lines we just collected.
          startLine = beforeParts.length + 1 - contextBefore.length;
          const afterParts = content
            .slice(idx + normalizedOld.length)
            .split("\n");
          afterParts.shift();
          for (
            let i = 0;
            i < afterParts.length && contextAfter.length < maxCtx;
            i++
          ) {
            if (/^\s*$/.test(afterParts[i])) break;
            contextAfter.push(afterParts[i]);
          }
        }
      }
    } catch {
      /* gracefully degrade to no context */
    }
  }
  return { contextBefore, contextAfter, lineIndent, startLine };
}

/**
 * Build the `edit-diff` step result from an edit's args plus its (possibly
 * absent) disk context. Returns null when the args aren't a well-formed edit, so
 * both the pending-approval preview and the post-execution render share one shape.
 */
export function editDiffResult(
  args: Record<string, unknown>,
  ctx: EditDiffContext | undefined,
): Extract<ToolStepResult, { kind: "edit-diff" }> | null {
  if (
    typeof args.path !== "string" ||
    typeof args.old_text !== "string" ||
    typeof args.new_text !== "string"
  ) {
    return null;
  }
  return {
    kind: "edit-diff",
    path: args.path,
    oldText: args.old_text,
    newText: args.new_text,
    contextBefore: ctx?.contextBefore ?? [],
    contextAfter: ctx?.contextAfter ?? [],
    lineIndent: ctx?.lineIndent ?? "",
    startLine: ctx?.startLine ?? 1,
  };
}

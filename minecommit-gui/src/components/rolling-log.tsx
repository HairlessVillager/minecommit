import * as React from "react"
import type { LogEntry, LogLine } from "@/components/log-viewer"
import { DEFAULT_LEVEL_COLORS, LEVEL_LABELS } from "@/components/log-viewer"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import { Check, ChevronsDown, Copy, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./ui/button"

export type Operation = "commit" | "restore" | "push" | "pull"

const OPERATION_LABELS: Record<Operation, string> = {
  commit: "提交",
  restore: "还原",
  push: "推送",
  pull: "拉取",
}

function formatTimestamp(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  const ms = d.getMilliseconds().toString().padStart(3, "0")
  return `${d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}.${ms}`
}

/** Normalise a backend LogLine (wire format) into a display LogEntry. */
function toLogEntry(raw: LogLine): LogEntry {
  const lower = raw.level.toLowerCase()
  let level: LogEntry["level"]
  if (lower === "error") level = "error"
  else if (lower === "warn" || lower === "warning") level = "warn"
  else if (lower === "debug") level = "debug"
  else if (lower === "trace") level = "verbose"
  else level = "info"

  return {
    level,
    message: raw.message,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Derive display entries from wire-format lines, preserving timestamps of
 * previously seen entries so they don't change on every render.
 */
function useStableEntries(lines: LogLine[] | undefined): LogEntry[] {
  const [entries, setEntries] = React.useState<LogEntry[]>([])
  const prevLengthRef = React.useRef(0)

  React.useEffect(() => {
    const src = lines ?? []
    // Reset when the array shrinks (e.g. new operation starts)
    if (src.length < prevLengthRef.current) {
      setEntries(src.map(toLogEntry))
    } else if (src.length > prevLengthRef.current) {
      const fresh = src.slice(prevLengthRef.current).map(toLogEntry)
      setEntries((prev) => [...prev, ...fresh])
    }
    prevLengthRef.current = src.length
  }, [lines])

  return entries
}

function RollingLogContent({
  operation,
  externalLines,
  externalFinished,
  onForceStop,
}: {
  operation: Operation
  externalLines?: LogLine[]
  externalFinished?: boolean
  onForceStop?: () => void
}) {
  const finished = externalFinished ?? false
  const entries = useStableEntries(externalLines)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = React.useState(true)
  const [copied, setCopied] = React.useState(false)

  const prevFinishedRef = React.useRef(finished)

  // auto-scroll
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    // When the operation just finished, force a scroll to bottom so the user
    // sees the final log lines (finished may flip in the same render as the
    // last entry, which would otherwise be skipped).
    const justFinished = finished && !prevFinishedRef.current
    prevFinishedRef.current = finished

    if (justFinished || isAtBottom) {
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight
      })
    }
  }, [entries.length, finished, isAtBottom])

  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 40
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    setIsAtBottom(atBottom)
  }, [])

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
      setIsAtBottom(true)
    }
  }, [])

  const handleCopy = React.useCallback(async () => {
    const text = entries
      .map(
        (e) =>
          `[${formatTimestamp(e.timestamp)}] [${LEVEL_LABELS[e.level]}] ${e.message}`
      )
      .join("\n")
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }, [entries])

  const handleDownload = React.useCallback(() => {
    const text = entries
      .map(
        (e) =>
          `[${formatTimestamp(e.timestamp)}] [${LEVEL_LABELS[e.level]}] ${e.message}`
      )
      .join("\n")
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${operation}-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [entries, operation])

  return (
    <>
      {/* Simplified toolbar */}
      <div className="flex items-center">
        <span className="flex-1 text-base">
          {OPERATION_LABELS[operation]}日志
        </span>
        <Button variant="ghost" onClick={handleCopy}>
          {copied ? <Check /> : <Copy />}
        </Button>
        <Button variant="ghost" onClick={handleDownload}>
          <Download />
        </Button>
        <Button variant="ghost" onClick={scrollToBottom}>
          <ChevronsDown />
        </Button>
      </div>

      {/* Log output */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-auto font-mono text-sm leading-relaxed"
        role="log"
        aria-live="polite"
      >
        {entries.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            暂无日志
          </div>
        ) : (
          entries.map((entry, i) => {
            const colors = DEFAULT_LEVEL_COLORS[entry.level]
            return (
              <div key={`rl-${i}`} className="flex">
                <span className="shrink-0 text-muted-foreground/60">
                  {formatTimestamp(entry.timestamp)}
                </span>
                &nbsp;
                <span
                  className={cn("w-[3ch] shrink-0 font-semibold", colors.text)}
                >
                  {LEVEL_LABELS[entry.level]}
                </span>
                &nbsp;
                <span className="min-w-0 break-all whitespace-pre-wrap [font-variant-ligatures:none]">
                  {entry.message}
                </span>
              </div>
            )
          })
        )}
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel disabled={!finished}>关闭</AlertDialogCancel>
        {!finished && (
          <AlertDialogAction variant="destructive" onClick={onForceStop}>
            强制停止
          </AlertDialogAction>
        )}
      </AlertDialogFooter>
    </>
  )
}

export function RollingLogDialog({
  open,
  onOpenChange,
  operation,
  logs,
  finished,
  onForceStop,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  operation: Operation
  logs?: LogLine[]
  finished?: boolean
  onForceStop?: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="fixed h-4/5 min-w-4/5 grid-rows-[auto_1fr_auto] flex-col">
        {open && (
          <RollingLogContent
            key={operation}
            operation={operation}
            externalLines={logs}
            externalFinished={finished}
            onForceStop={onForceStop}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

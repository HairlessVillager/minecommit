import { useEffect, useRef, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export type Operation = "commit" | "restore" | "push" | "pull"

const LOG_FILES: Record<Operation, string> = {
  commit: "/mock-commit.log",
  restore: "/mock-restore.log",
  push: "/mock-push.log",
  pull: "/mock-pull.log",
}

function RollingLogContent({
  operation,
  externalLines,
  externalFinished,
  onForceStop,
}: {
  operation: Operation
  externalLines?: string[]
  externalFinished?: boolean
  onForceStop?: () => void
}) {
  const [displayedLines, setDisplayedLines] = useState<string[]>([])
  const [finished, setFinished] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const indexRef = useRef(0)

  // Reset state when operation or externalLines change
  useEffect(() => {
    indexRef.current = 0

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    const source = externalLines ?? null

    if (source && source.length > 0) {
      // External lines: show them one by one with animation
      timerRef.current = setInterval(() => {
        if (indexRef.current >= source.length) {
          if (timerRef.current) clearInterval(timerRef.current)
          setFinished(true)
          return
        }
        setDisplayedLines((prev) => [...prev, source[indexRef.current]])
        indexRef.current++
      }, 80)
    } else if (!source) {
      // Fallback to mock file
      fetch(LOG_FILES[operation])
        .then((res) => res.text())
        .then((text) => {
          const allLines = text.split("\n")
          timerRef.current = setInterval(() => {
            if (indexRef.current >= allLines.length) {
              if (timerRef.current) clearInterval(timerRef.current)
              setFinished(true)
              return
            }
            setDisplayedLines((prev) => [...prev, allLines[indexRef.current]])
            indexRef.current++
          }, 80)
        })
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // We intentionally omit externalLines from deps to avoid restarting on every append.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation])

  // When externalFinished becomes true and we still have lines queued, drain them fast
  useEffect(() => {
    if (externalFinished && timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null

      const source = externalLines ?? []
      // Show remaining lines quickly
      const remaining = source.slice(indexRef.current)
      if (remaining.length > 0) {
        setDisplayedLines((prev) => [...prev, ...remaining])
        indexRef.current = source.length
      }
      setFinished(true)
    }
  }, [externalFinished, externalLines])

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [displayedLines])

  const handleForceStop = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setFinished(true)
    onForceStop?.()
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>运行日志</AlertDialogTitle>
        <AlertDialogDescription>
          {finished ? "运行结束" : "请耐心等待运行结束..."}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <pre
        ref={preRef}
        className="min-h-0 overflow-y-auto rounded-md bg-secondary p-4 font-mono text-sm whitespace-pre-wrap text-secondary-foreground"
      >
        {displayedLines.join("\n")}
      </pre>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={!finished}>关闭</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={handleForceStop}>
          强制停止
        </AlertDialogAction>
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
  logs?: string[]
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

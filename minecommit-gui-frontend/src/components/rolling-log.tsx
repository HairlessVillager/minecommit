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

function RollingLogContent({ operation }: { operation: Operation }) {
  const [lines, setLines] = useState<string[]>([])
  const [finished, setFinished] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(LOG_FILES[operation])
      .then((res) => res.text())
      .then((text) => {
        if (cancelled) return
        const allLines = text.split("\n")
        let index = 0

        timerRef.current = setInterval(() => {
          if (index >= allLines.length) {
            if (timerRef.current) clearInterval(timerRef.current)
            setFinished(true)
            return
          }
          setLines((prev) => [...prev, allLines[index]])
          index++
        }, 80)
      })

    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [operation])

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [lines])

  const handleForceStop = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setFinished(true)
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
        {lines.join("\n")}
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  operation: Operation
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="fixed h-4/5 min-w-4/5 grid-rows-[auto_1fr_auto] flex-col">
        {open && <RollingLogContent key={operation} operation={operation} />}
      </AlertDialogContent>
    </AlertDialog>
  )
}

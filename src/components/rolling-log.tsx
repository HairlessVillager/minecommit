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

export function RollingLogDialog({
  open,
  onOpenChange,
  operation,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  operation: Operation
}) {
  const [lines, setLines] = useState<string[]>([])
  const [finished, setFinished] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const allLinesRef = useRef<string[]>([])

  useEffect(() => {
    if (!open) return

    setLines([])
    setFinished(false)

    fetch(LOG_FILES[operation])
      .then((res) => res.text())
      .then((text) => {
        allLinesRef.current = text.split("\n")
        let index = 0

        timerRef.current = setInterval(() => {
          if (index >= allLinesRef.current.length) {
            if (timerRef.current) clearInterval(timerRef.current)
            setFinished(true)
            return
          }
          setLines((prev) => [...prev, allLinesRef.current[index]])
          index++
        }, 80)
      })

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [open, operation])

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
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="fixed min-h-4/5 min-w-4/5 grid-rows-[auto_1fr_auto] flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle>运行日志</AlertDialogTitle>
          <AlertDialogDescription>
            {finished ? "运行结束" : "请耐心等待运行结束..."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <pre
          ref={preRef}
          className="overflow-y-auto rounded-md bg-secondary p-4 font-mono text-sm whitespace-pre-wrap text-secondary-foreground"
        >
          {lines.join("\n")}
        </pre>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={!finished}>关闭</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleForceStop}>
            强制停止
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

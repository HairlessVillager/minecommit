import { useCallback, useEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { useCommitAuthor } from "@/contexts/commit-author"
import { Dock } from "@/components/unlumen-ui/dock"
import {
  CloudDownload,
  CloudUpload,
  HardDriveDownload,
  HardDriveUpload,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSaves } from "@/contexts/saves"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RollingLogDialog, type Operation } from "@/components/rolling-log"
import type { LogLine } from "@/components/log-viewer"

function CommitDialog({
  open,
  onOpenChange,
  onCommitStart,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCommitStart: () => void
}) {
  const { author, setAuthor } = useCommitAuthor()
  const { selectedSave } = useSaves()
  const [committing, setCommitting] = useState(false)
  const [message, setMessage] = useState("-")
  const [name, setName] = useState(author.name || "")
  const [email, setEmail] = useState(author.email || "")

  const branch = selectedSave?.default_branch ?? "main"

  const handleSubmit = useCallback(async () => {
    if (!selectedSave || committing) return
    setCommitting(true)

    const finalMessage = message || "-"

    // Save author info if changed
    if (name && (name !== author.name || email !== author.email)) {
      try {
        await setAuthor(name, email)
      } catch {
        // ignore
      }
    }

    // Open log dialog and close commit dialog immediately
    onOpenChange(false)
    onCommitStart()

    invoke<{ success: boolean; error: string | null }>("perform_commit", {
      saveDir: selectedSave.path,
      gitDir: selectedSave.repo_path,
      branch,
      message: finalMessage,
      extraPatterns: [],
      ignorePatterns: [],
      useRepack: true,
    })
      .then((result) => {
        if (!result.success) {
          console.error("Commit failed:", result.error)
        }
      })
      .catch((err) => {
        console.error("Commit error:", err)
      })
      .finally(() => {
        setCommitting(false)
      })
  }, [
    selectedSave,
    committing,
    message,
    name,
    email,
    author.name,
    author.email,
    setAuthor,
    branch,
    onCommitStart,
    onOpenChange,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>提交到 Git 以备份</DialogTitle>
          <DialogDescription>填写提交信息作为备注</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <Label htmlFor="branch">分支</Label>
            <Input id="branch" name="branch" value={branch} disabled />
          </Field>
          <Field>
            <Label htmlFor="message">提交信息</Label>
            <Textarea
              id="message"
              name="message"
              placeholder="例如：刷怪塔完工"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="name">你的游戏昵称</Label>
            <Input
              id="name"
              name="name"
              placeholder="例如：HairlessVillager"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="email">联系邮箱</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="例如：hairlessvilager@foxmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline" disabled={committing}>
                取消
              </Button>
            }
          ></DialogClose>
          <Button onClick={handleSubmit} disabled={committing}>
            {committing ? "提交中..." : "提交"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RestoreDialog({
  open,
  onOpenChange,
  onRestoreStart,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestoreStart: () => void
}) {
  const { selectedSave } = useSaves()

  const handleRestore = useCallback(async () => {
    if (!selectedSave) return
    onOpenChange(false)
    onRestoreStart()

    invoke<{ success: boolean; error: string | null }>("perform_restore", {
      saveDir: selectedSave.path,
      gitDir: selectedSave.repo_path,
    })
      .then((result) => {
        if (!result.success) {
          console.error("Restore failed:", result.error)
        }
      })
      .catch((err) => {
        console.error("Restore error:", err)
      })
  }, [selectedSave, onOpenChange, onRestoreStart])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-lg break-all">
        <DialogHeader>
          <DialogTitle>确定要恢复最近提交吗？</DialogTitle>
          <DialogDescription>
            这将会用 Git
            仓库中最新的提交覆盖当前存档。如果存档已存在，将被重命名为
            .&lt;时间戳&gt;.snapshot 备份。
          </DialogDescription>
        </DialogHeader>
        {selectedSave && (
          <ul className="ml-6 list-disc [&>li]:mt-2">
            <li>
              <span>存档</span>: {selectedSave.name}
            </li>
            <li>
              <span>路径</span>: {selectedSave.path}
            </li>
            <li>
              <span>仓库</span>: {selectedSave.repo_path}
            </li>
          </ul>
        )}
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline">取消</Button>}
          ></DialogClose>
          <Button onClick={handleRestore}>恢复</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PushDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}) {
  const remotes = [
    { label: "origin", value: "https://example.com/HairlessVillager/save.git" },
    { label: "upstream", value: "https://example.com/upstream/save.git" },
  ]
  const branchs = [
    { label: "main", value: "main" },
    { label: "dev", value: "dev" },
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>推送分支到远程仓库</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <Label htmlFor="message">远程仓库</Label>
            <Select items={remotes}>
              <SelectTrigger className="w-45">
                <SelectValue placeholder="origin" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {remotes.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>{" "}
          </Field>
          <Field>
            <Label htmlFor="message">推送分支</Label>
            <Select items={branchs}>
              <SelectTrigger className="w-45">
                <SelectValue placeholder="main" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {branchs.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>{" "}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline">取消</Button>}
          ></DialogClose>
          <Button onClick={onSubmit}>推送</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PullDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}) {
  const remotes = [
    { label: "origin", value: "https://example.com/HairlessVillager/save.git" },
    { label: "upstream", value: "https://example.com/upstream/save.git" },
  ]
  const branchs = [
    { label: "main", value: "main" },
    { label: "dev", value: "dev" },
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>从远程仓库拉取分支</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <Label htmlFor="message">远程仓库</Label>
            <Select items={remotes}>
              <SelectTrigger className="w-45">
                <SelectValue placeholder="origin" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {remotes.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>{" "}
          </Field>
          <Field>
            <Label htmlFor="message">拉取分支</Label>
            <Select items={branchs}>
              <SelectTrigger className="w-45">
                <SelectValue placeholder="main" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {branchs.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>{" "}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline">取消</Button>}
          ></DialogClose>
          <Button onClick={onSubmit}>拉取</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function HomePage() {
  const { selectedSave } = useSaves()
  const [commitDialogOpen, setCommitDialogOpen] = useState(false)
  const [commitDialogKey, setCommitDialogKey] = useState(0)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [pushDialogOpen, setPushDialogOpen] = useState(false)
  const [pullDialogOpen, setPullDialogOpen] = useState(false)
  const [logDialogOpen, setLogDialogOpen] = useState(false)
  const [operation, setOperation] = useState<Operation>("commit")
  const [commitLogs, setCommitLogs] = useState<LogLine[]>([])
  const [commitFinished, setCommitFinished] = useState(false)
  const unlistenRefs = useRef<Array<() => void>>([])

  // Clean up event listeners when log dialog closes
  useEffect(() => {
    if (!logDialogOpen) {
      unlistenRefs.current.forEach((fn) => fn())
      unlistenRefs.current = []
    }
  }, [logDialogOpen])

  const openLog = (op: Operation, logs?: LogLine[], finished?: boolean) => {
    setOperation(op)
    if (logs !== undefined) setCommitLogs(logs)
    if (finished !== undefined) setCommitFinished(finished)
    setLogDialogOpen(true)
  }

  const setupLogListeners = useCallback(async (op: Operation) => {
    setCommitLogs([])
    setCommitFinished(false)
    setOperation(op)

    unlistenRefs.current.forEach((fn) => fn())
    unlistenRefs.current = []

    const unlisten1 = await listen<LogLine>("commit-log", (event) => {
      setCommitLogs((prev) => [...prev, event.payload])
    })
    const unlisten2 = await listen("commit-finished", () => {
      setCommitFinished(true)
    })
    unlistenRefs.current = [unlisten1, unlisten2]

    setLogDialogOpen(true)
  }, [])

  const handleCommitStart = useCallback(async () => {
    await setupLogListeners("commit")
  }, [setupLogListeners])

  const handleRestoreStart = useCallback(async () => {
    await setupLogListeners("restore")
  }, [setupLogListeners])

  const items = [
    {
      icon: <HardDriveDownload />,
      label: "提交 / 备份",
      onClick: () => {
        setCommitDialogKey((k) => k + 1)
        setCommitDialogOpen(true)
      },
    },
    {
      icon: <HardDriveUpload />,
      label: "恢复最近提交",
      onClick: () => setRestoreDialogOpen(true),
      separator: true,
    },
    {
      icon: <CloudUpload />,
      label: "上传 / 推送",
      onClick: () => setPushDialogOpen(true),
    },
    {
      icon: <CloudDownload />,
      label: "下载 / 拉取",
      onClick: () => setPullDialogOpen(true),
    },
  ]

  return (
    <div className="flex w-full flex-col items-center justify-center gap-4">
      <Dock items={items} />
      {selectedSave && (
        <p className="text-sm text-muted-foreground">{selectedSave.name}</p>
      )}
      <CommitDialog
        key={commitDialogKey}
        open={commitDialogOpen}
        onOpenChange={setCommitDialogOpen}
        onCommitStart={handleCommitStart}
      />
      <RestoreDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onRestoreStart={handleRestoreStart}
      />
      <PushDialog
        open={pushDialogOpen}
        onOpenChange={setPushDialogOpen}
        onSubmit={() => {
          setPushDialogOpen(false)
          openLog("push")
        }}
      />
      <PullDialog
        open={pullDialogOpen}
        onOpenChange={setPullDialogOpen}
        onSubmit={() => {
          setPullDialogOpen(false)
          openLog("pull")
        }}
      />
      <RollingLogDialog
        open={logDialogOpen}
        onOpenChange={setLogDialogOpen}
        operation={operation}
        logs={commitLogs}
        finished={commitFinished}
      />
    </div>
  )
}

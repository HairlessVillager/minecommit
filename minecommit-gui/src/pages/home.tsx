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
import { RollingLogDialog, type Operation } from "@/components/rolling-log"
import type { LogLine } from "@/components/log-viewer"
import { SaveHoverCard } from "@/components/save-hover-card"

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
          <SaveHoverCard save={selectedSave}>
            <Button variant="link">{selectedSave.name}</Button>
          </SaveHoverCard>
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
  onPushStart,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPushStart: () => void
}) {
  const { selectedSave } = useSaves()

  const [pushing, setPushing] = useState(false)
  const [remote, setRemote] = useState(selectedSave?.remote_repo_path ?? "")
  const [branch, setBranch] = useState(selectedSave?.default_branch ?? "main")

  const handlePush = useCallback(async () => {
    const save = selectedSave
    if (!save || pushing || !remote || !branch) return
    setPushing(true)

    onOpenChange(false)
    onPushStart()

    invoke<{ success: boolean; error: string | null }>("perform_push", {
      gitDir: save.repo_path,
      remote,
      branch,
    })
      .then((result) => {
        if (!result.success) {
          console.error("Push failed:", result.error)
        }
      })
      .catch((err) => {
        console.error("Push error:", err)
      })
      .finally(() => {
        setPushing(false)
      })
  }, [selectedSave, pushing, remote, branch, onPushStart, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>推送分支到远程仓库</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <Label htmlFor="push-remote">远程仓库地址</Label>
            <Input
              id="push-remote"
              name="push-remote"
              placeholder="https://example.com/user/save.git"
              value={remote}
              onChange={(e) => setRemote(e.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="push-branch">推送分支</Label>
            <Input
              id="push-branch"
              name="push-branch"
              placeholder="main"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline" disabled={pushing}>
                取消
              </Button>
            }
          ></DialogClose>
          <Button onClick={handlePush} disabled={pushing || !remote || !branch}>
            {pushing ? "推送中..." : "推送"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PullDialog({
  open,
  onOpenChange,
  onPullStart,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPullStart: () => void
}) {
  const { selectedSave } = useSaves()
  const [pulling, setPulling] = useState(false)
  const [remote, setRemote] = useState(selectedSave?.remote_repo_path ?? "")
  const [branch, setBranch] = useState(selectedSave?.default_branch ?? "main")


  const handlePull = useCallback(async () => {
    const save = selectedSave
    if (!save || pulling || !remote || !branch) return
    setPulling(true)

    onOpenChange(false)
    onPullStart()

    invoke<{ success: boolean; error: string | null }>("perform_pull", {
      gitDir: save.repo_path,
      remote,
      branch,
    })
      .then((result) => {
        if (!result.success) {
          console.error("Pull failed:", result.error)
        }
      })
      .catch((err) => {
        console.error("Pull error:", err)
      })
      .finally(() => {
        setPulling(false)
      })
  }, [selectedSave, pulling, remote, branch, onPullStart, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>从远程仓库拉取分支</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <Label htmlFor="pull-remote">远程仓库地址</Label>
            <Input
              id="pull-remote"
              name="pull-remote"
              placeholder="https://example.com/user/save.git"
              value={remote}
              onChange={(e) => setRemote(e.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="pull-branch">拉取分支</Label>
            <Input
              id="pull-branch"
              name="pull-branch"
              placeholder="main"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline" disabled={pulling}>
                取消
              </Button>
            }
          ></DialogClose>
          <Button onClick={handlePull} disabled={pulling || !remote || !branch}>
            {pulling ? "拉取中..." : "拉取"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function HomePage() {
  const { selectedSave } = useSaves()
  const [commitDialogOpen, setCommitDialogOpen] = useState(false)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [pushDialogOpen, setPushDialogOpen] = useState(false)
  const [pullDialogOpen, setPullDialogOpen] = useState(false)
  const [logDialogOpen, setLogDialogOpen] = useState(false)
  const [commitDialogKey, setCommitDialogKey] = useState(0)
  const [pushDialogKey, setPushDialogKey] = useState(0)
  const [pullDialogKey, setPullDialogKey] = useState(0)
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

  const handlePushStart = useCallback(async () => {
    await setupLogListeners("push")
  }, [setupLogListeners])

  const handlePullStart = useCallback(async () => {
    await setupLogListeners("pull")
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
      onClick: () => {
        setPushDialogKey((k) => k + 1)
        setPushDialogOpen(true)
      },
    },
    {
      icon: <CloudDownload />,
      label: "下载 / 拉取",
      onClick: () => {
        setPullDialogKey((k) => k + 1)
        setPullDialogOpen(true)
      },
    },
  ]

  return (
    <div className="flex w-full flex-col items-center justify-center gap-4">
      <Dock items={items} />
      {selectedSave && (
        <SaveHoverCard save={selectedSave}>
          <Button variant="link" className="text-muted-foreground">
            {selectedSave.name}
          </Button>
        </SaveHoverCard>
      )}
      <CommitDialog
        key={`commit-${commitDialogKey}`}
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
        key={`push-${pushDialogKey}`}
        open={pushDialogOpen}
        onOpenChange={setPushDialogOpen}
        onPushStart={handlePushStart}
      />
      <PullDialog
        key={`pull-${pullDialogKey}`}
        open={pullDialogOpen}
        onOpenChange={setPullDialogOpen}
        onPullStart={handlePullStart}
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

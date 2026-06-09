import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useState } from "react"
import { Trash2, HardDrive, FolderOpen } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog"
import { useSaves } from "@/contexts/saves"
import { Label } from "@/components/ui/label"

function EmptySave({ onAddTrack }: { onAddTrack: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HardDrive />
        </EmptyMedia>
        <EmptyTitle>跟踪一个存档</EmptyTitle>
        <EmptyDescription>
          <p>MineCommit 还没有跟踪任何存档</p>
          <p>点击按钮来跟踪一个已有的存档</p>
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onAddTrack}>添加跟踪</Button>
      </EmptyContent>
    </Empty>
  )
}

type AddTrackStep = "select" | "confirm" | "select-branch" | "init"

function AddTrackDialog({
  open,
  onOpenChange,
  onSaveAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaveAdded: () => void
}) {
  const [step, setStep] = useState<AddTrackStep>("select")

  // Form state (pre-filled after folder selection)
  const [name, setName] = useState("")
  const [path, setPath] = useState("")
  const [localRepoPath, setLocalRepoPath] = useState("")
  const [remoteRepoPath, setRemoteRepoPath] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [branches, setBranches] = useState<string[]>([])
  const [defaultBranch, setDefaultBranch] = useState("")
  const [initBranch, setInitBranch] = useState("main")

  function resetAll() {
    setStep("select")
    setName("")
    setPath("")
    setLocalRepoPath("")
    setRemoteRepoPath("")
    setError("")
    setSubmitting(false)
    setSelecting(false)
    setBranches([])
    setDefaultBranch("")
    setInitBranch("main")
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      resetAll()
    }
    onOpenChange(open)
  }

  // --- Step: select ---
  async function handleSelectFolder() {
    setSelecting(true)
    try {
      const selected = await openFolderDialog({
        directory: true,
        multiple: false,
        title: "选择存档文件夹",
      })
      if (selected) {
        // Derive fields via backend
        const info = await invoke<{ name: string; repo_path: string }>(
          "derive_save_info",
          { path: selected }
        )
        setName(info.name)
        setPath(selected)
        setLocalRepoPath(info.repo_path)
        setRemoteRepoPath("")
        setError("")
        setStep("confirm")
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSelecting(false)
    }
  }

  // --- Step: confirm ---
  async function handleSubmit(e: { preventDefault: () => void }) {
    e.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      const exists = await invoke<boolean>("check_repo_exists", {
        repoPath: localRepoPath,
      })
      if (!exists) {
        setSubmitting(false)
        setStep("init")
        return
      }
      // Repo exists — fetch branches and let user select one
      setSubmitting(false)
      const branchList = await invoke<string[]>("list_branches", {
        repoPath: localRepoPath,
      })
      setBranches(branchList)
      if (branchList.length === 0) {
        // No commits yet — read HEAD ref to determine the default branch
        const headRef = await invoke<string>("get_head_ref", {
          repoPath: localRepoPath,
        })
        await invoke("add_save", {
          name,
          path,
          repoPath: localRepoPath,
          remoteRepoPath,
          defaultBranch: headRef,
        })
        onOpenChange(false)
        resetAll()
        onSaveAdded()
        return
      }
      // Pick first branch as default if available
      setDefaultBranch(branchList[0])
      setStep("select-branch")
    } catch (err) {
      setError(String(err))
      setSubmitting(false)
    }
  }

  async function handleInitComplete(branchName: string) {
    setInitializing(true)
    try {
      await invoke("init_bare_repo", {
        repoPath: localRepoPath,
        defaultBranch: branchName,
      })
      await invoke("add_save", {
        name,
        path,
        repoPath: localRepoPath,
        remoteRepoPath,
        defaultBranch: branchName,
      })
      onOpenChange(false)
      resetAll()
      onSaveAdded()
    } catch (err) {
      setError(String(err))
      setStep("confirm")
    } finally {
      setInitializing(false)
    }
  }

  async function handleBranchConfirm() {
    setSubmitting(true)
    try {
      await invoke("add_save", {
        name,
        path,
        repoPath: localRepoPath,
        remoteRepoPath,
        defaultBranch,
      })
      onOpenChange(false)
      resetAll()
      onSaveAdded()
    } catch (err) {
      setError(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  function handleInitCancel() {
    setStep("confirm")
  }

  function handleBack() {
    resetAll()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {step === "select" && (
          <>
            <DialogHeader>
              <DialogTitle>选择存档</DialogTitle>
              <DialogDescription>
                选择一个存档文件夹，需包含 level.dat 文件
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-4">
              <Button
                size="lg"
                disabled={selecting}
                onClick={handleSelectFolder}
                className="w-full max-w-xs"
              >
                <FolderOpen data-icon="inline-start" />
                {selecting ? "请选择…" : "选择存档文件夹"}
              </Button>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                取消
              </DialogClose>
            </DialogFooter>
          </>
        )}

        {step === "confirm" && (
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>确认存档信息</DialogTitle>
              <DialogDescription>
                已自动填写以下字段，请确认或修改后提交
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="save-name">存档名称</FieldLabel>
                <Input
                  id="save-name"
                  placeholder="我的世界"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="save-path">存档路径</FieldLabel>
                <Input
                  id="save-path"
                  placeholder="/home/user/.minecraft/saves/我的世界"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="local-repo-path">本地仓库路径</FieldLabel>
                <Input
                  id="local-repo-path"
                  placeholder="/home/user/.minecraft/minecommit/我的世界.git"
                  value={localRepoPath}
                  onChange={(e) => setLocalRepoPath(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="remote-repo-path">
                  远程仓库路径（可选）
                </FieldLabel>
                <Input
                  id="remote-repo-path"
                  placeholder="https://git.example.com/我的世界.git"
                  value={remoteRepoPath}
                  onChange={(e) => setRemoteRepoPath(e.target.value)}
                />
              </Field>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </FieldGroup>
            <DialogFooter className="mt-6">
              <Button variant="outline" type="button" onClick={handleBack}>
                返回
              </Button>
              <Button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? "添加中…" : "跟踪"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === "select-branch" && (
          <>
            <DialogHeader>
              <DialogTitle>选择默认分支</DialogTitle>
              <DialogDescription>
                该存档关联的仓库已存在，请选择一个分支作为默认分支
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="select-branch">默认分支</FieldLabel>
                <Select
                  value={defaultBranch}
                  onValueChange={(v) => setDefaultBranch(v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="请选择一个分支" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch} value={branch}>
                        {branch}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("confirm")}>
                返回
              </Button>
              <Button
                disabled={submitting || !defaultBranch}
                onClick={handleBranchConfirm}
              >
                {submitting ? "添加中…" : "确认跟踪"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "init" && (
          <>
            <DialogHeader>
              <DialogTitle>初始化 Git 仓库</DialogTitle>
              <DialogDescription>
                仓库目录不存在，需要初始化一个 Git 裸仓库
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="init-branch">默认分支名</FieldLabel>
                <Input
                  id="init-branch"
                  placeholder="main"
                  value={initBranch}
                  onChange={(e) => setInitBranch(e.target.value)}
                />
              </Field>
            </FieldGroup>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={handleInitCancel}>
                返回
              </Button>
              <Button
                disabled={initializing}
                onClick={() => {
                  if (!initBranch.trim()) {
                    setError("分支名不能为空")
                    return
                  }
                  handleInitComplete(initBranch.trim())
                }}
              >
                {initializing ? "初始化中…" : "初始化仓库"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function SaveManagePage() {
  const { saves, loaded, refreshSaves } = useSaves()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteRepoChecked, setDeleteRepoChecked] = useState(false)
  const [error, setError] = useState("")

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    try {
      await invoke("delete_save", {
        name: deleteTarget,
        deleteRepo: deleteRepoChecked,
      })
      await refreshSaves()
      setDeleteDialogOpen(false)
      setDeleteTarget(null)
      setDeleteRepoChecked(false)
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-end justify-between">
            <div>
              <CardTitle>存档列表</CardTitle>
            </div>
            {saves.length > 0 && (
              <Button onClick={() => setDialogOpen(true)}>添加跟踪</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          {!loaded ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : saves.length === 0 ? (
            <EmptySave onAddTrack={() => setDialogOpen(true)} />
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-auto text-muted-foreground">
                    存档名称
                  </TableHead>
                  <TableHead className="w-52 text-muted-foreground">
                    最近访问
                  </TableHead>
                  <TableHead className="w-18">
                    <span className="sr-only">操作</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saves.map((save) => (
                  <HoverCard key={save.name}>
                    <HoverCardTrigger render={<TableRow />}>
                      <TableCell className="truncate text-left">
                        {save.name}
                      </TableCell>
                      <TableCell>{save.last_access}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(save.name)
                            setDeleteRepoChecked(false)
                            setDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </HoverCardTrigger>
                    <HoverCardContent align="start" className="w-auto text-xs">
                      <div className="flex flex-col gap-2">
                        <div>
                          <p className="text-muted-foreground">存档名称</p>
                          <p className="break-all">{save.name}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">最近访问</p>
                          <p className="break-all">{save.last_access}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">存档路径</p>
                          <p className="break-all">{save.path}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">仓库路径</p>
                          <p className="break-all">{save.repo_path}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">远程仓库路径</p>
                          {save.remote_repo_path ? (
                            <p className="break-all">{save.remote_repo_path}</p>
                          ) : (
                            <p className="break-all text-muted-foreground">
                              {"（未设置）"}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-muted-foreground">默认分支</p>
                          <p className="break-all">
                            {save.default_branch || "—"}
                          </p>
                        </div>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddTrackDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaveAdded={refreshSaves}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除存档</DialogTitle>
            <DialogDescription>
              确定要删除存档「{deleteTarget}」吗？
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field orientation="horizontal" data-disabled>
              <Checkbox
                id="delete-repo-checkbox"
                name="delete-repo-checkbox"
                checked={deleteRepoChecked}
                onCheckedChange={(checked) =>
                  setDeleteRepoChecked(checked === true)
                }
              />
              <Label htmlFor="delete-repo-checkbox">
                同时删除本地 Git 仓库与备份数据
              </Label>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false)
                setDeleteTarget(null)
                setDeleteRepoChecked(false)
              }}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

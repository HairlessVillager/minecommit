import { useState } from "react"
import { Dock } from "@/components/unlumen-ui/dock"
import {
  BookDown,
  BookUp,
  BookUp2,
  HardDriveDownload,
  HardDriveUpload,
} from "lucide-react"
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

function CommitDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>提交到 Git 以备份</DialogTitle>
          <DialogDescription>填写提交信息作为备注</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <Label htmlFor="message">提交信息</Label>
            <Textarea
              id="message"
              name="message"
              placeholder="例如：刷怪塔完工"
            />
          </Field>
          <Field>
            <Label htmlFor="name">你的游戏昵称</Label>
            <Input
              id="name"
              name="name"
              placeholder="例如：HairlessVillager"
            />
          </Field>
          <Field>
            <Label htmlFor="email">联系邮箱</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="例如：hairlessvilager@foxmail.com"
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline">取消</Button>}
          ></DialogClose>
          <Button onClick={onSubmit}>提交</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RestoreDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>确定要恢复以下提交吗？</DialogTitle>
        </DialogHeader>
        <ul className="ml-6 list-disc [&>li]:mt-2">
          <li>
            <span>时间</span>: 2026/05/30 11:27:24 +0800
          </li>
          <li>
            <span>ID</span>: 5694bb8ccd107e3892ea565b056afa5de941fe47
          </li>
          <li>
            <span>作者</span>: HairlessVillager
            &lt;hairlessvillager@foxmail.com&gt;
          </li>
          <li>
            <span>信息</span>: 刷怪塔完工
          </li>
        </ul>
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline">取消</Button>}
          ></DialogClose>
          <Button variant="secondary">全部提交</Button>
          <Button onClick={onSubmit}>恢复</Button>
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
  const [commitDialogOpen, setCommitDialogOpen] = useState(false)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [pushDialogOpen, setPushDialogOpen] = useState(false)
  const [pullDialogOpen, setPullDialogOpen] = useState(false)
  const [logDialogOpen, setLogDialogOpen] = useState(false)
  const [operation, setOperation] = useState<Operation>("commit")

  const openLog = (op: Operation) => {
    setOperation(op)
    setLogDialogOpen(true)
  }

  const items = [
    {
      icon: <BookUp2 />,
      label: "快速提交 / 备份",
      onClick: () => openLog("commit"),
      separator: true,
    },
    {
      icon: <BookUp />,
      label: "备注提交 / 备份",
      onClick: () => setCommitDialogOpen(true),
    },
    {
      icon: <BookDown />,
      label: "恢复最近提交",
      onClick: () => setRestoreDialogOpen(true),
      separator: true,
    },
    {
      icon: <HardDriveUpload />,
      label: "上传 / 推送",
      onClick: () => setPushDialogOpen(true),
    },
    {
      icon: <HardDriveDownload />,
      label: "下载 / 拉取",
      onClick: () => setPullDialogOpen(true),
    },
  ]

  return (
    <div className="flex w-full items-center justify-center">
      <Dock items={items} />
      <CommitDialog
        open={commitDialogOpen}
        onOpenChange={setCommitDialogOpen}
        onSubmit={() => { setCommitDialogOpen(false); openLog("commit") }}
      />
      <RestoreDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onSubmit={() => { setRestoreDialogOpen(false); openLog("restore") }}
      />
      <PushDialog
        open={pushDialogOpen}
        onOpenChange={setPushDialogOpen}
        onSubmit={() => { setPushDialogOpen(false); openLog("push") }}
      />
      <PullDialog
        open={pullDialogOpen}
        onOpenChange={setPullDialogOpen}
        onSubmit={() => { setPullDialogOpen(false); openLog("pull") }}
      />
      <RollingLogDialog
        open={logDialogOpen}
        onOpenChange={setLogDialogOpen}
        operation={operation}
      />
    </div>
  )
}

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

function CommitDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form>
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
              <Label htmlFor="name">玩家昵称</Label>
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
            <Button type="submit">提交</Button>
          </DialogFooter>
        </DialogContent>
      </form>
    </Dialog>
  )
}

export function HomePage() {
  const [dialogOpen, setDialogOpen] = useState(false)

  const items = [
    {
      icon: <BookUp2 />,
      label: "快速提交 / 备份",
      separator: true,
    },
    {
      icon: <BookUp />,
      label: "备注提交 / 备份",
      onClick: () => setDialogOpen(true),
    },
    { icon: <BookDown />, label: "恢复最近提交", separator: true },
    { icon: <HardDriveUpload />, label: "上传 / 推送" },
    { icon: <HardDriveDownload />, label: "下载 / 拉取" },
  ]

  return (
    <div className="flex w-full items-center justify-center">
      <Dock items={items} />
      <CommitDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}

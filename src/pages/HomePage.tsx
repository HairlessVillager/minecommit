import { Dock } from "@/components/unlumen-ui/dock"
import {
  BookDown,
  BookUp,
  BookUp2,
  HardDriveDownload,
  HardDriveUpload,
} from "lucide-react"

const items = [
  { icon: <BookUp2 />, label: "快速提交 / 备份" },
  { icon: <BookUp />, label: "备注提交 / 备份" },
  { icon: <BookDown />, label: "检出最近提交", separator: true },
  { icon: <HardDriveUpload />, label: "上传 / 推送" },
  { icon: <HardDriveDownload />, label: "下载 / 拉取" },
]

export function HomePage() {
  return (
    <div className="flex w-full items-center justify-center">
      <Dock items={items} gap={6} />
    </div>
  )
}

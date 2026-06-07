import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
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

interface Save {
  name: string
  path: string
  repoPath: string
  remoteRepoPath: string
}

const saves: Save[] = [
  {
    name: "世界1",
    path: "/home/user/.minecraft/saves/世界1",
    repoPath: "/home/user/.minecraft/saves/世界1/.git",
    remoteRepoPath: "https://github.com/user/mc-world1.git",
  },
  {
    name: "创造测试",
    path: "/home/user/.minecraft/saves/创造测试",
    repoPath: "/home/user/.minecraft/saves/创造测试/.git",
    remoteRepoPath: "https://github.com/user/mc-creative.git",
  },
  {
    name: "红石实验室",
    path: "/home/user/.minecraft/saves/红石实验室",
    repoPath: "/home/user/.minecraft/saves/红石实验室/.git",
    remoteRepoPath: "https://github.com/user/mc-redstone.git",
  },
  {
    name: "生存存档",
    path: "/home/user/.minecraft/saves/生存存档",
    repoPath: "/home/user/.minecraft/saves/生存存档/.git",
    remoteRepoPath: "",
  },
]

export function SaveManagePage() {
  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">存档管理</h1>

      <Card>
        <CardHeader>
          <CardTitle>存档列表</CardTitle>
          <CardDescription>管理你的 Minecraft 存档</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>存档名称</TableHead>
                <TableHead>存档路径</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {saves.map((save) => (
                <HoverCard key={save.name}>
                  <HoverCardTrigger
                    render={<TableRow className="cursor-pointer" />}
                  >
                    <TableCell className="font-medium">{save.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {save.path}
                    </TableCell>
                  </HoverCardTrigger>
                  <HoverCardContent side="right" align="start" className="w-96">
                    <div className="flex flex-col gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          存档名称
                        </p>
                        <p className="font-medium">{save.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          存档路径
                        </p>
                        <p className="font-mono text-xs break-all">
                          {save.path}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          仓库路径
                        </p>
                        <p className="font-mono text-xs break-all">
                          {save.repoPath}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          远程仓库路径
                        </p>
                        <p className="font-mono text-xs break-all">
                          {save.remoteRepoPath || "（未设置）"}
                        </p>
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              ))}
              {saves.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className="text-center text-muted-foreground"
                  >
                    暂无存档
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

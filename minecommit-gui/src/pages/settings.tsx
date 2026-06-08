import { useState, useEffect } from "react"
import { useCommitAuthor } from "@/contexts/commit-author"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function SettingsPage() {
  const { author, loaded, setAuthor } = useCommitAuthor()
  const [name, setName] = useState(author.name)
  const [email, setEmail] = useState(author.email)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setName(author.name)
    setEmail(author.email)
  }, [author])

  const handleSave = async () => {
    setSaving(true)
    try {
      await setAuthor(name, email)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">设置</h1>

      <Card>
        <CardHeader>
          <CardTitle>提交作者</CardTitle>
          <CardDescription>
            设置 Git 提交时使用的作者名称和邮箱
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="author-name">名称</Label>
            <Input
              id="author-name"
              placeholder="例如: Steve"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="author-email">邮箱</Label>
            <Input
              id="author-email"
              placeholder="例如: steve@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
            {saved && (
              <span className="text-sm text-green-600 dark:text-green-400">
                已保存
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

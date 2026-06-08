import { useState, useEffect, useCallback, type ReactNode } from "react"
import { invoke } from "@tauri-apps/api/core"
import { CommitAuthorContext, type CommitAuthor } from "./commit-author"

export function CommitAuthorProvider({ children }: { children: ReactNode }) {
  const [author, setAuthorState] = useState<CommitAuthor>({ name: "", email: "" })
  const [loaded, setLoaded] = useState(false)

  const refreshAuthor = useCallback(async () => {
    try {
      const data = await invoke<CommitAuthor>("get_commit_author")
      setAuthorState(data)
    } catch {
      // ignore
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    let ignore = false
    invoke<CommitAuthor>("get_commit_author")
      .then((data) => {
        if (!ignore) {
          setAuthorState(data)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setLoaded(true)
      })
    return () => {
      ignore = true
    }
  }, [])

  const setAuthor = useCallback(async (name: string, email: string) => {
    const data = await invoke<CommitAuthor>("set_commit_author", { name, email })
    setAuthorState(data)
  }, [])

  return (
    <CommitAuthorContext.Provider
      value={{ author, loaded, refreshAuthor, setAuthor }}
    >
      {children}
    </CommitAuthorContext.Provider>
  )
}

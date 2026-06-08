import { createContext, useContext } from "react"

export interface CommitAuthor {
  name: string
  email: string
}

export interface CommitAuthorContextValue {
  author: CommitAuthor
  loaded: boolean
  refreshAuthor: () => Promise<void>
  setAuthor: (name: string, email: string) => Promise<void>
}

export const CommitAuthorContext = createContext<CommitAuthorContextValue | null>(null)

export function useCommitAuthor() {
  const ctx = useContext(CommitAuthorContext)
  if (!ctx) throw new Error("useCommitAuthor must be used within a CommitAuthorProvider")
  return ctx
}

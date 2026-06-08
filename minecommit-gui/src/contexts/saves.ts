import { createContext, useContext } from "react"

export interface Save {
  name: string
  path: string
  repo_path: string
  remote_repo_path: string
  last_access: string
}

export interface SavesContextValue {
  saves: Save[]
  loaded: boolean
  refreshSaves: () => Promise<void>
  selectedSave: Save | null
  setSelectedSave: (save: Save | null) => void
}

export const SavesContext = createContext<SavesContextValue | null>(null)

export function useSaves() {
  const ctx = useContext(SavesContext)
  if (!ctx) throw new Error("useSaves must be used within a SavesProvider")
  return ctx
}

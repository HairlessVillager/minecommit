import { useState, useEffect, useCallback, type ReactNode } from "react"
import { invoke } from "@tauri-apps/api/core"
import { SavesContext, type Save } from "./saves"

export function SavesProvider({ children }: { children: ReactNode }) {
  const [saves, setSaves] = useState<Save[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedSave, setSelectedSave] = useState<Save | null>(null)

  const refreshSaves = useCallback(async () => {
    try {
      const data = await invoke<Save[]>("list_saves")
      setSaves(data)
    } catch {
      // ignore
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    let ignore = false
    invoke<Save[]>("list_saves")
      .then((data) => {
        if (!ignore) {
          setSaves(data)
          // Auto select latest access save
          if (data.length > 0) {
            const sorted = [...data].sort((a, b) =>
              b.last_access.localeCompare(a.last_access)
            )
            setSelectedSave(sorted[0])
          }
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

  return (
    <SavesContext.Provider
      value={{ saves, loaded, refreshSaves, selectedSave, setSelectedSave }}
    >
      {children}
    </SavesContext.Provider>
  )
}

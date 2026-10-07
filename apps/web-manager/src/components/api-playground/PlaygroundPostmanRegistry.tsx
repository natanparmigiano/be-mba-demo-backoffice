import {
  createContext,
  useContext,
  useEffect,
  useId,
  type ReactNode,
} from 'react'
import type {
  PlaygroundPostmanEntry,
  PlaygroundPostmanFolder,
} from './PlaygroundRequestActions'

interface RegisteredPostmanEntry extends PlaygroundPostmanEntry {
  folderPath: string[]
}

export type PlaygroundPostmanRegistry = Map<string, RegisteredPostmanEntry>

interface RegistryContextValue {
  registry: PlaygroundPostmanRegistry
  folderPath: string[]
  variableReplacements: Record<string, string>
}

const RegistryContext = createContext<RegistryContextValue | null>(null)

/** Adds a folder to the current collection path while retaining one registry. */
export function PlaygroundPostmanRegistryProvider({
  registry,
  folder,
  variableReplacements,
  children,
}: {
  registry?: PlaygroundPostmanRegistry
  folder?: string | string[]
  variableReplacements?: Record<string, string>
  children: ReactNode
}) {
  const parent = useContext(RegistryContext)
  const activeRegistry = registry ?? parent?.registry
  if (!activeRegistry)
    throw new Error('A Postman registry is required at the provider root')

  const folderPath = [
    ...(parent?.folderPath ?? []),
    ...(typeof folder === 'string' ? [folder] : (folder ?? [])),
  ]
  const activeVariableReplacements = {
    ...(parent?.variableReplacements ?? {}),
    ...variableReplacements,
  }
  return (
    <RegistryContext.Provider
      value={{
        registry: activeRegistry,
        folderPath,
        variableReplacements: activeVariableReplacements,
      }}
    >
      {children}
    </RegistryContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRegisterPlaygroundPostmanEntry(
  entry: PlaygroundPostmanEntry,
) {
  const context = useContext(RegistryContext)
  const id = useId()

  useEffect(() => {
    if (!context) return
    context.registry.set(id, {
      ...entry,
      folderPath: context.folderPath,
      variableReplacements: context.variableReplacements,
    })
    return () => {
      context.registry.delete(id)
    }
  }, [context, entry, id])
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlaygroundPostmanVariableReplacements() {
  return useContext(RegistryContext)?.variableReplacements
}

/** Converts the mounted-card registry into the nested serializer input. */
// eslint-disable-next-line react-refresh/only-export-components
export function postmanFoldersFromRegistry(
  registry: PlaygroundPostmanRegistry,
): PlaygroundPostmanFolder[] {
  const roots: PlaygroundPostmanFolder[] = []
  for (const { folderPath, ...entry } of registry.values()) {
    let folders = roots
    for (const [index, name] of folderPath.entries()) {
      let folder = folders.find((candidate) => candidate.name === name)
      if (!folder) {
        folder = { name, entries: [], folders: [] }
        folders.push(folder)
      }
      folders = folder.folders ?? (folder.folders = [])
      if (index === folderPath.length - 1)
        (folder.entries ?? (folder.entries = [])).push(entry)
    }
  }
  return roots
}

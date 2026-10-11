import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { useRuntimeFileListForWorktree } from '@/components/quick-open-file-list'
import { rankQuickOpenFilesWithHistory } from '@/components/quick-open-history-ranking'
import { useQuickOpenHistory } from '@/lib/quick-open-file-history'
import { findTerminalTabWorktreeId } from './native-chat-file-link'
import { useKnownWorktreeById } from '@/store/selectors'

const MENTION_FILE_LIMIT = 20
const MENTION_FOLDER_LIMIT = 6
const NO_ITEMS: readonly NativeChatMentionItem[] = []

export type NativeChatMentionItem = { kind: 'file' | 'folder'; path: string }

export function nativeChatMentionFolders(files: readonly string[]): string[] {
  const folders = new Set<string>()
  for (const file of files) {
    const parts = file.replaceAll('\\', '/').split('/')
    for (let length = 1; length < parts.length; length += 1) {
      folders.add(parts.slice(0, length).join('/'))
    }
  }
  return [...folders]
}

export function nativeChatMentionItems(
  query: string,
  files: readonly string[],
  history: readonly string[],
  folders: readonly string[]
): NativeChatMentionItem[] {
  const rankedFolders = rankQuickOpenFilesWithHistory(query, folders, [])
    .slice(0, MENTION_FOLDER_LIMIT)
    .map(({ path }): NativeChatMentionItem => ({ kind: 'folder', path }))
  const rankedFiles = rankQuickOpenFilesWithHistory(query, files, history)
    .slice(0, MENTION_FILE_LIMIT - rankedFolders.length)
    .map(({ path }): NativeChatMentionItem => ({ kind: 'file', path }))
  return [...rankedFolders, ...rankedFiles]
}

export type NativeChatMentionFiles = {
  /** Workspace-relative paths, best match first. */
  items: readonly NativeChatMentionItem[]
  loading: boolean
  failed: boolean
}

/** `query` is null while no `@` token is open. */
export function useNativeChatMentionFiles(args: {
  query: string | null
  terminalTabId: string
  structuredWorktreeId?: string
}): NativeChatMentionFiles {
  const { query, terminalTabId, structuredWorktreeId } = args
  const enabled = query !== null
  // Closed is the common state, so the tab scan only runs while a token is open.
  const worktreeId = useAppStore((state) =>
    enabled
      ? (structuredWorktreeId ?? findTerminalTabWorktreeId(state.tabsByWorktree, terminalTabId))
      : null
  )
  const worktreePath = useKnownWorktreeById(worktreeId)?.path ?? null
  const history = useQuickOpenHistory(worktreeId, worktreePath)
  const list = useRuntimeFileListForWorktree({
    enabled,
    worktreeId,
    query: query ?? '',
    recentPaths: history
  })
  const failed = list.loadError !== null
  const folders = useMemo(() => nativeChatMentionFolders(list.files), [list.files])

  return useMemo(
    () => ({
      items:
        query === null ? NO_ITEMS : nativeChatMentionItems(query, list.files, history, folders),
      loading: list.loading,
      failed
    }),
    [failed, folders, history, list.files, list.loading, query]
  )
}

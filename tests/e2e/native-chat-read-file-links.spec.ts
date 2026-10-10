import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import {
  enableNativeChatSetting,
  seedClaudeProviderSession,
  toggleTerminalTabToChatView
} from './helpers/native-chat-transcript-fixture'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { waitForActivePaneHookDescriptor, waitForActiveTerminalManager } from './helpers/terminal'

test('short file reads expose their links in the chat trail', async ({
  orcaPage,
  testRepoPath
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  await ensureTerminalVisible(orcaPage)
  await waitForActiveTerminalManager(orcaPage)

  const descriptor = await waitForActivePaneHookDescriptor(orcaPage)
  const [tabId] = descriptor.paneKey.split(':')
  const sessionId = randomUUID()
  const transcriptPath = path.join(testRepoPath, `read-links-${sessionId}.jsonl`)
  const readmePath = path.join(testRepoPath, 'README.md')
  const indexPath = path.join(testRepoPath, 'src', 'index.ts')
  const startedAt = Date.now() - 5_000
  writeFileSync(
    transcriptPath,
    `${[
      {
        sessionId,
        uuid: `${sessionId}-user`,
        timestamp: new Date(startedAt).toISOString(),
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'Read these files' }] }
      },
      {
        sessionId,
        uuid: `${sessionId}-assistant`,
        timestamp: new Date(startedAt + 1_000).toISOString(),
        type: 'assistant',
        message: {
          role: 'assistant',
          model: 'claude-opus-4',
          content: [
            { type: 'tool_use', id: 'readme', name: 'Read', input: { file_path: readmePath } },
            { type: 'tool_use', id: 'index', name: 'Read', input: { file_path: indexPath } }
          ]
        }
      },
      {
        sessionId,
        uuid: `${sessionId}-results`,
        timestamp: new Date(startedAt + 2_000).toISOString(),
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'readme', content: '# Test repository' },
            { type: 'tool_result', tool_use_id: 'index', content: 'export const value = 1' }
          ]
        }
      }
    ]
      .map((line) => JSON.stringify(line))
      .join('\n')}\n`
  )

  await enableNativeChatSetting(orcaPage)
  await seedClaudeProviderSession(orcaPage, {
    paneKey: descriptor.paneKey,
    worktreeId: descriptor.worktreeId,
    sessionId,
    transcriptPath
  })
  await toggleTerminalTabToChatView(orcaPage, { tabId, worktreeId: descriptor.worktreeId })

  const chat = orcaPage.locator('[data-native-chat-root="true"]')
  const summary = chat.locator('[data-native-chat-tool-run-state]').first()
  await expect(summary).toHaveAttribute('aria-expanded', 'true')
  await expect(chat.getByRole('link', { name: readmePath })).toBeVisible()
  await expect(chat.getByRole('link', { name: indexPath })).toBeVisible()
  await orcaPage.screenshot({ path: testInfo.outputPath('visible-read-links.png') })
  await chat.getByRole('link', { name: readmePath }).click()
  await orcaPage
    .getByRole('dialog')
    .getByRole('button', { name: /Open file/ })
    .click()
  await expect(orcaPage.getByRole('button', { name: /README\.md Close tab/ })).toBeVisible()
})

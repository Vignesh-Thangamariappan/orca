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

const PREFIX = 'Long draft context. '.repeat(5000)
const TYPED = 'abcdefghijklmnopqrstuvwx'

test('chat composer keeps up with typing in a long conversation and draft', async ({
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
  const transcriptPath = path.join(testRepoPath, `typing-latency-${sessionId}.jsonl`)
  const startedAt = Date.now() - 120_000
  const rows = Array.from({ length: 120 }, (_, index) => {
    const role = index % 2 === 0 ? 'user' : 'assistant'
    return {
      sessionId,
      uuid: `${sessionId}-${index}`,
      timestamp: new Date(startedAt + index * 1_000).toISOString(),
      type: role,
      message: {
        role,
        model: 'claude-opus-4',
        content: [{ type: 'text', text: `${role} message ${index}: ${'context '.repeat(40)}` }]
      }
    }
  })
  writeFileSync(transcriptPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`)
  await enableNativeChatSetting(orcaPage)
  await seedClaudeProviderSession(orcaPage, {
    paneKey: descriptor.paneKey,
    worktreeId: descriptor.worktreeId,
    sessionId,
    transcriptPath
  })
  await toggleTerminalTabToChatView(orcaPage, { tabId, worktreeId: descriptor.worktreeId })
  await expect(orcaPage.getByText('assistant message 119:', { exact: false })).toBeVisible()

  const composer = orcaPage.getByRole('textbox', {
    name: 'Ask anything, @ for files or folders, / for commands',
    exact: true
  })
  await expect(composer).toBeVisible()
  await composer.click()
  await orcaPage.keyboard.insertText(PREFIX)
  await expect(composer).toHaveText(PREFIX)

  await composer.evaluate((element) => {
    const starts: number[] = []
    const latencies: number[] = []
    element.addEventListener(
      'keydown',
      (event) => {
        if (event.key.length === 1) {
          starts.push(performance.now())
        }
      },
      true
    )
    new MutationObserver(() => {
      const startedAt = starts.shift()
      if (startedAt !== undefined) {
        latencies.push(performance.now() - startedAt)
        element.setAttribute('data-typing-latencies', JSON.stringify(latencies))
      }
    }).observe(element, { characterData: true, childList: true, subtree: true })
  })

  await orcaPage.keyboard.type(TYPED)
  await expect(composer).toHaveText(PREFIX + TYPED)
  const samples = JSON.parse((await composer.getAttribute('data-typing-latencies')) ?? '[]')
  expect(samples).toHaveLength(TYPED.length)
  const sorted = [...samples].sort((left, right) => left - right)
  const median = sorted[Math.floor(sorted.length / 2)]
  const worst = sorted.at(-1)
  testInfo.annotations.push({
    type: 'chat-typing-latency',
    description: `median=${median.toFixed(1)}ms worst=${worst.toFixed(1)}ms`
  })
  console.log(`chat typing: median=${median.toFixed(1)}ms worst=${worst.toFixed(1)}ms`)
  expect(median).toBeLessThan(30)
  expect(worst).toBeLessThan(100)
})

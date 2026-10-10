// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatBlock } from '../../../../shared/native-chat-types'
import { NativeChatToolRun } from './NativeChatToolRun'

afterEach(cleanup)

const read = (file: string): NativeChatBlock => ({
  type: 'tool-call',
  name: 'Read',
  input: { file_path: file },
  state: 'completed'
})

describe('read-only tool runs', () => {
  it('shows file targets without opening the summary', () => {
    const onLinkClick = vi.fn()
    const { container } = render(
      <NativeChatToolRun
        blocks={[read('src/a.ts'), read('src/b.ts')]}
        expandSignal={false}
        onLinkClick={onLinkClick}
      />
    )

    const summary = container.querySelector('[data-native-chat-tool-run-state]')
    expect(summary).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'src/a.ts' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'src/b.ts' })).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'src/a.ts' }))
    expect(onLinkClick).toHaveBeenCalledOnce()
    expect(summary).toHaveAttribute('aria-expanded', 'true')
  })

  it('collapses when the run grows beyond three files', () => {
    const first = [read('a.ts'), read('b.ts'), read('c.ts')]
    const { container, rerender } = render(
      <NativeChatToolRun blocks={first} expandSignal={false} />
    )
    const summary = container.querySelector('[data-native-chat-tool-run-state]')
    expect(summary).toHaveAttribute('aria-expanded', 'true')

    rerender(<NativeChatToolRun blocks={[...first, read('d.ts')]} expandSignal={false} />)
    expect(summary).toHaveAttribute('aria-expanded', 'false')
  })
})

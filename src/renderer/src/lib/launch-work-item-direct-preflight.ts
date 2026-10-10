import { getSetupConfig } from '@/lib/new-workspace'
import { checkRuntimeHooks } from '@/runtime/runtime-hooks-client'
import { resolveGitHubPrStartPointForRepo } from '@/lib/github-pr-start-point'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { OrcaHooks, RepoHookSettings } from '../../../shared/orca-yaml-hook-types'
import type { SetupDecision } from '../../../shared/worktree/create-types'
import type { GitHubPrStartPoint } from '../../../shared/worktree/types'

export async function resolveDirectPrStartPoint(
  repoId: string,
  prNumber: number,
  target: RuntimeClientTarget | null,
  hints: {
    branchName?: string
    headRefName?: string
    baseRefName?: string
    isCrossRepository?: boolean
  } = {}
): Promise<GitHubPrStartPoint> {
  return resolveGitHubPrStartPointForRepo({
    repoId,
    prNumber,
    target,
    headRefName: hints.headRefName ?? hints.branchName,
    baseRefName: hints.baseRefName,
    isCrossRepository: hints.isCrossRepository
  })
}

export async function resolveDirectSetupDecision(
  repoId: string,
  repo: { hookSettings?: RepoHookSettings },
  ownerHostId: ExecutionHostId
): Promise<{ kind: 'decided'; decision: SetupDecision } | { kind: 'needs-modal' }> {
  let yamlHooks: OrcaHooks | null = null
  try {
    // Why: the same owner host as the PR start point and createWorktree, never focus.
    const result = await checkRuntimeHooks(null, repoId, ownerHostId)
    yamlHooks = (result.hooks as OrcaHooks | null) ?? null
  } catch {
    yamlHooks = null
  }
  const setupConfig = getSetupConfig(repo, yamlHooks)
  if (!setupConfig) {
    // Why: no setup script configured, so this path should behave like callers
    // that omit a setup decision entirely.
    return { kind: 'decided', decision: 'inherit' }
  }
  const policy = repo.hookSettings?.setupRunPolicy ?? 'run-by-default'
  if (policy === 'ask') {
    return { kind: 'needs-modal' }
  }
  return {
    kind: 'decided',
    decision: policy === 'run-by-default' ? 'run' : 'skip'
  }
}

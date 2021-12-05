import * as core from '@actions/core';
import * as github from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import type { PullRequest, PullRequestEvent } from '@octokit/webhooks-definitions/schema';

async function run(): Promise<void> {
  try {
    const token = core.getInput('github_token');
    const commit_sha = core.getInput('commit_sha');
    const octokit = github.getOctokit(token);

    const owner = github.context.repo.owner;
    const repo = github.context.repo.repo;

    const [commit, prs] = await Promise.all([
      octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha,
      }),
      octokit.rest.repos.listPullRequestsAssociatedWithCommit({
        owner,
        repo,
        commit_sha,
      })
    ]);

    for (const pr of prs.data) {
      core.warning(`${pr.number}: ${pr.state} ${pr.merge_commit_sha} ?= ${commit_sha}`);
    }

    const candidates = prs.data.filter(pr => pr.state === "closed").filter(pr => pr.merge_commit_sha === commit_sha).filter(pr => !!pr.merged_at);
    if (candidates.length == 0) {
      throw new Error(`no associated pull requests were found for ${commit_sha}`);
    }
    if (candidates.length > 1) {
      throw new Error(`multiple candidate pull requests were found for ${commit_sha}`);
    }

    if (commit.data.parents.length == 0) {
      throw new Error(`no parent for ${commit_sha} (this should be a rare condition, only ne histories can experience this)`);
    }
    if (commit.data.parents.length > 1) {
      throw new Error(`multiple parents found for ${commit_sha}, the _mainline framework_ only works with _squash merge_ mainlines`);
    }

    const pr = candidates[0];

    const pr_base_sha = pr.base.sha;
    const commit_base_sha = commit.data.parents[0].sha;
    if (commit_base_sha !== pr_base_sha) {
      throw new Error(`the parent for ${commit_sha} doesn't match the base of pull request #${pr.number}, the _mainline framework_ only works with _squash merge_ mainlines`);
    }

    core.info(`PR ${pr.issue_url} seems acceptable as a base for #{commit_sha}`);
    core.info(`Stealing build artifacts and test results is possible, given additional checks.`);
    core.setOutput('mainline_producer', `${pr.number}`);

  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()

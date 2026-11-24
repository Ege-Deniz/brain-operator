"use strict";

/* Brain Operator — Git Worktree & Diff Orchestrator
 *
 * Gives every parallel thread its own isolated git worktree under
 * `.brain-operator/worktrees/<slug>` on branch `bo/<slug>`, plus
 * live diff inspection, secret preflight, scoped commit, safe merge-back,
 * and clean teardown.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const core = require("./core");

function slugifyBranchPart(text) {
  const base = String(text || "thread")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || "thread";
}

function getRepoInfo(workspaceRoot) {
  const inside = core.runGit(workspaceRoot, ["rev-parse", "--is-inside-work-tree"], 3000);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return { isGitRepo: false, repoRoot: null, branch: null, headSha: null, dirtyFiles: [], dirtyCount: 0, hasCommits: false };
  }
  const top = core.runGit(workspaceRoot, ["rev-parse", "--show-toplevel"], 3000);
  const repoRoot = top.ok ? top.stdout.trim() : workspaceRoot;
  const br = core.runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"], 3000);
  const sha = core.runGit(repoRoot, ["rev-parse", "--short", "HEAD"], 3000);
  const st = core.runGit(repoRoot, ["status", "--porcelain=v1", "-uall"], 4000);
  const dirtyFiles = st.ok
    ? st.stdout.split("\n").filter((l) => l.trim()).map((l) => l.slice(3).trim())
    : [];
  return {
    isGitRepo: true,
    repoRoot,
    branch: br.ok ? br.stdout.trim() : "HEAD",
    headSha: sha.ok ? sha.stdout.trim() : null,
    hasCommits: sha.ok && Boolean(sha.stdout.trim()),
    dirtyFiles,
    dirtyCount: dirtyFiles.length,
  };
}

function listWorktrees(workspaceRoot) {
  const info = getRepoInfo(workspaceRoot);
  if (!info.isGitRepo) return [];
  const res = core.runGit(info.repoRoot, ["worktree", "list", "--porcelain"], 5000);
  if (!res.ok) return [];

  const managedRoot = path.resolve(info.repoRoot, core.WORKTREES_DIR_REL);
  const entries = [];
  let cur = null;

  for (const rawLine of res.stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      if (cur) entries.push(cur);
      cur = null;
      continue;
    }
    if (line.startsWith("worktree ")) {
      if (cur) entries.push(cur);
      cur = { path: line.slice("worktree ".length).trim(), head: null, branch: null, detached: false, bare: false };
    } else if (cur && line.startsWith("HEAD ")) {
      cur.head = line.slice(5).trim();
    } else if (cur && line.startsWith("branch ")) {
      cur.branch = line.slice(7).trim().replace(/^refs\/heads\//, "");
    } else if (cur && line === "detached") {
      cur.detached = true;
    } else if (cur && line === "bare") {
      cur.bare = true;
    }
  }
  if (cur) entries.push(cur);

  const mainPath = path.resolve(info.repoRoot);
  return entries.map((w) => {
    const abs = path.resolve(w.path);
    const isMain = abs === mainPath;
    const isManaged = abs.startsWith(managedRoot + path.sep);
    let dirtyCount = 0;
    let ahead = 0;
    if (fs.existsSync(abs)) {
      const st = core.runGit(abs, ["status", "--porcelain"], 3000);
      if (st.ok) dirtyCount = st.stdout.split("\n").filter((l) => l.trim()).length;
      if (!isMain && info.branch && w.branch && w.branch !== info.branch) {
        const cnt = core.runGit(info.repoRoot, ["rev-list", "--count", `${info.branch}..${w.branch}`], 3000);
        if (cnt.ok) ahead = parseInt(cnt.stdout.trim(), 10) || 0;
      }
    }
    return {
      path: abs,
      relPath: isManaged ? path.relative(mainPath, abs).split(path.sep).join("/") : abs,
      head: w.head ? w.head.slice(0, 8) : null,
      branch: w.branch || "(detached)",
      isMain,
      isManaged,
      dirtyCount,
      ahead,
    };
  });
}

function createWorktree(workspaceRoot, opts) {
  const o = opts || {};
  const info = getRepoInfo(workspaceRoot);
  if (!info.isGitRepo) {
    throw new Error("Workspace is not a git repository — initialize git first to use isolated worktrees.");
  }
  if (!info.hasCommits) {
    throw new Error("Git repository has no commits yet — create an initial commit before spawning a worktree.");
  }

  core.ensureBrainStateDirOnDisk(info.repoRoot);
  const worktreesRoot = path.join(info.repoRoot, core.WORKTREES_DIR_REL);
  fs.mkdirSync(worktreesRoot, { recursive: true });

  const suffix = crypto.randomBytes(3).toString("hex");
  const slug = `${slugifyBranchPart(o.name || o.threadId || "thread")}-${suffix}`;
  const branch = `bo/${slug}`;
  const wtPath = path.join(worktreesRoot, slug);
  const baseBranch = o.baseRef || info.branch || "HEAD";

  const add = core.runGit(info.repoRoot, ["worktree", "add", "-b", branch, wtPath, baseBranch], 15000);
  if (!add.ok) {
    throw new Error(`git worktree add failed: ${add.stderr.trim() || add.stdout.trim()}`);
  }

  // Ensure the worktree's own .brain-operator/.gitignore exists if state gets written there
  core.ensureBrainStateDirOnDisk(wtPath);

  return {
    path: path.resolve(wtPath),
    relPath: path.relative(info.repoRoot, wtPath).split(path.sep).join("/"),
    branch,
    baseBranch,
    baseSha: info.headSha,
    createdAt: new Date().toISOString(),
  };
}

function getWorktreeDiff(targetPath, baseRef) {
  const info = getRepoInfo(targetPath);
  if (!info.isGitRepo) {
    return {
      isGitRepo: false,
      branch: null,
      files: [],
      diff: "",
      aheadCommits: [],
      secretWarnings: [],
      totalInsertions: 0,
      totalDeletions: 0,
    };
  }

  const st = core.runGit(targetPath, ["status", "--porcelain=v1", "-uall"], 5000);
  const numstat = core.runGit(targetPath, ["diff", "--numstat", "HEAD"], 5000);
  const statsMap = new Map();
  if (numstat.ok) {
    for (const line of numstat.stdout.split("\n")) {
      const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (!m) continue;
      statsMap.set(m[3].trim(), {
        insertions: m[1] === "-" ? 0 : parseInt(m[1], 10),
        deletions: m[2] === "-" ? 0 : parseInt(m[2], 10),
      });
    }
  }

  const files = [];
  const seen = new Set();
  if (st.ok) {
    for (const rawLine of st.stdout.split("\n")) {
      if (!rawLine || rawLine.length < 4) continue;
      const code = rawLine.slice(0, 2);
      let filePath = rawLine.slice(3).trim();
      if (filePath.includes(" -> ")) filePath = filePath.split(" -> ").pop().trim();
      if (!filePath || seen.has(filePath)) continue;
      seen.add(filePath);
      const ns = statsMap.get(filePath) || { insertions: 0, deletions: 0 };
      let insertions = ns.insertions;
      if (code === "??") {
        try {
          const full = path.join(targetPath, filePath);
          if (fs.existsSync(full) && fs.statSync(full).size < 256 * 1024) {
            insertions = fs.readFileSync(full, "utf8").split("\n").length;
          }
        } catch { /* ignore */ }
      }
      files.push({
        status: code.trim() || "M",
        path: filePath,
        insertions,
        deletions: ns.deletions,
        untracked: code === "??",
      });
    }
  }

  // Also check committed files ahead of baseRef if this is a feature branch
  let aheadCommits = [];
  let branchFiles = [];
  if (baseRef && baseRef !== info.branch) {
    const logRes = core.runGit(targetPath, ["log", "--oneline", "--no-color", `${baseRef}..HEAD`], 4000);
    if (logRes.ok) {
      aheadCommits = logRes.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    }
    const bStat = core.runGit(targetPath, ["diff", "--numstat", `${baseRef}...HEAD`], 5000);
    if (bStat.ok) {
      for (const line of bStat.stdout.split("\n")) {
        const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
        if (!m) continue;
        const rel = m[3].trim();
        branchFiles.push({
          status: "C",
          path: rel,
          insertions: m[1] === "-" ? 0 : parseInt(m[1], 10),
          deletions: m[2] === "-" ? 0 : parseInt(m[2], 10),
          committed: true,
        });
      }
    }
  }

  // Build unified diff (working tree + untracked previews + branch diff if working tree clean)
  const MAX_DIFF_CHARS = 120 * 1024;
  const diffParts = [];
  const wtDiff = core.runGit(targetPath, ["diff", "HEAD"], 8000);
  if (wtDiff.ok && wtDiff.stdout.trim()) diffParts.push(wtDiff.stdout.trimEnd());

  for (const f of files.filter((x) => x.untracked).slice(0, 10)) {
    try {
      const full = path.join(targetPath, f.path);
      const stFile = fs.statSync(full);
      if (stFile.isFile() && stFile.size <= 32 * 1024) {
        const lines = fs.readFileSync(full, "utf8").split("\n");
        const header = `diff --git a/${f.path} b/${f.path}\nnew file\n--- /dev/null\n+++ b/${f.path}\n@@ -0,0 +1,${lines.length} @@`;
        diffParts.push(header + "\n" + lines.map((l) => `+${l}`).join("\n"));
      }
    } catch { /* ignore */ }
  }

  if (diffParts.length === 0 && baseRef && aheadCommits.length > 0) {
    const brDiff = core.runGit(targetPath, ["diff", `${baseRef}...HEAD`], 8000);
    if (brDiff.ok && brDiff.stdout.trim()) diffParts.push(brDiff.stdout.trimEnd());
  }

  let diffText = diffParts.join("\n\n");
  let truncated = false;
  if (diffText.length > MAX_DIFF_CHARS) {
    diffText = diffText.slice(0, MAX_DIFF_CHARS) + "\n\n... (diff truncated at 120 KB) ...";
    truncated = true;
  }

  const allPaths = Array.from(new Set([...files.map((f) => f.path), ...branchFiles.map((f) => f.path)]));
  const secretWarnings = core.scanFilesForSecrets(targetPath, allPaths);
  const combinedList = files.length ? files : branchFiles;
  const totalInsertions = combinedList.reduce((s, f) => s + (f.insertions || 0), 0);
  const totalDeletions = combinedList.reduce((s, f) => s + (f.deletions || 0), 0);

  return {
    isGitRepo: true,
    branch: info.branch,
    baseRef: baseRef || null,
    headSha: info.headSha,
    files,
    branchFiles,
    aheadCommits,
    diff: diffText,
    truncated,
    secretWarnings,
    totalInsertions,
    totalDeletions,
  };
}

function commitWorktree(worktreePath, message, opts) {
  const msg = core.cleanText(message || "", 500);
  if (!msg) return { ok: false, error: "Commit message is required." };

  const diff = getWorktreeDiff(worktreePath);
  if (!diff.isGitRepo) return { ok: false, error: "Target path is not a git repository." };
  if (diff.files.length === 0) return { ok: false, error: "No uncommitted changes to commit." };

  if (diff.secretWarnings.length > 0 && !(opts && opts.allowSecrets)) {
    const list = diff.secretWarnings.map((w) => `${w.path} (${w.label})`).join(", ");
    return { ok: false, secretBlocked: true, error: `Refused to commit likely secrets: ${list}` };
  }

  const add = core.runGit(worktreePath, ["add", "-A"], 10000);
  if (!add.ok) return { ok: false, error: `git add failed: ${add.stderr.trim()}` };

  const commit = core.runGit(worktreePath, ["commit", "-m", msg], 15000);
  if (!commit.ok) return { ok: false, error: `git commit failed: ${commit.stderr.trim() || commit.stdout.trim()}` };

  const sha = core.runGit(worktreePath, ["rev-parse", "--short", "HEAD"], 3000);
  return {
    ok: true,
    sha: sha.ok ? sha.stdout.trim() : null,
    summary: commit.stdout.split("\n")[0] || "committed",
  };
}

function isManagedWorktreePath(repoRoot, targetPath) {
  const managedRoot = path.resolve(repoRoot, core.WORKTREES_DIR_REL);
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(managedRoot + path.sep);
}

function mergeWorktree(workspaceRoot, worktree, opts) {
  const o = opts || {};
  const info = getRepoInfo(workspaceRoot);
  if (!info.isGitRepo) return { ok: false, error: "Workspace is not a git repository." };
  if (!worktree || !worktree.branch || !worktree.path) {
    return { ok: false, error: "Thread has no attached worktree." };
  }

  // Check if worktree has uncommitted changes
  const wtDiff = getWorktreeDiff(worktree.path, worktree.baseBranch);
  if (wtDiff.files.length > 0) {
    if (o.commitMessage) {
      const committed = commitWorktree(worktree.path, o.commitMessage, o);
      if (!committed.ok) return committed;
    } else {
      return {
        ok: false,
        needsCommit: true,
        error: `Worktree has ${wtDiff.files.length} uncommitted file(s). Commit them before merging.`,
      };
    }
  }

  // Re-check ahead commits
  const ahead = core.runGit(info.repoRoot, ["rev-list", "--count", `HEAD..${worktree.branch}`], 4000);
  const aheadCount = ahead.ok ? (parseInt(ahead.stdout.trim(), 10) || 0) : 0;
  if (aheadCount === 0) {
    return { ok: false, error: `Branch ${worktree.branch} has no commits ahead of ${info.branch}.` };
  }

  // Fail closed if the base workspace has dirty tracked files
  if (info.dirtyCount > 0) {
    return {
      ok: false,
      dirtyBase: true,
      error: `Base workspace (${info.branch}) has ${info.dirtyCount} uncommitted change(s). Clean or commit them before merging.`,
    };
  }

  // Secret check on committed changes
  const finalDiff = getWorktreeDiff(worktree.path, info.branch);
  if (finalDiff.secretWarnings.length > 0 && !o.allowSecrets) {
    const list = finalDiff.secretWarnings.map((w) => `${w.path} (${w.label})`).join(", ");
    return { ok: false, secretBlocked: true, error: `Merge blocked — likely secrets detected: ${list}` };
  }

  const mergeMsg = core.cleanText(o.mergeMessage || `Merge ${worktree.branch} into ${info.branch}`, 500);
  const merge = core.runGit(info.repoRoot, ["merge", "--no-ff", worktree.branch, "-m", mergeMsg], 20000);
  if (!merge.ok) {
    // Always abort cleanly so the base checkout is never left broken.
    core.runGit(info.repoRoot, ["merge", "--abort"], 5000);
    return {
      ok: false,
      conflict: true,
      error: `Merge conflict with ${info.branch}; merge aborted cleanly. Resolve in the worktree first.\n${merge.stderr.trim() || merge.stdout.trim()}`,
    };
  }

  let cleaned = false;
  if (o.cleanup !== false) {
    const rm = removeWorktree(info.repoRoot, worktree.path, worktree.branch, { force: true, deleteBranch: true });
    cleaned = rm.ok;
  }

  const newSha = core.runGit(info.repoRoot, ["rev-parse", "--short", "HEAD"], 3000);
  return {
    ok: true,
    mergedBranch: worktree.branch,
    intoBranch: info.branch,
    headSha: newSha.ok ? newSha.stdout.trim() : null,
    aheadCount,
    cleaned,
  };
}

function removeWorktree(workspaceRoot, worktreePath, branch, opts) {
  const o = opts || {};
  const info = getRepoInfo(workspaceRoot);
  if (!info.isGitRepo) return { ok: false, error: "Workspace is not a git repository." };
  if (!worktreePath || !isManagedWorktreePath(info.repoRoot, worktreePath)) {
    return { ok: false, error: "Refused to remove path outside .brain-operator/worktrees/." };
  }

  const args = ["worktree", "remove"];
  if (o.force) args.push("--force");
  args.push(worktreePath);
  const rm = core.runGit(info.repoRoot, args, 15000);
  if (!rm.ok && fs.existsSync(worktreePath)) {
    return { ok: false, error: `git worktree remove failed: ${rm.stderr.trim()}` };
  }
  core.runGit(info.repoRoot, ["worktree", "prune"], 5000);

  let branchDeleted = false;
  if (branch && branch.startsWith("bo/") && o.deleteBranch !== false) {
    const del = core.runGit(info.repoRoot, ["branch", o.force ? "-D" : "-d", branch], 5000);
    branchDeleted = del.ok;
  }
  return { ok: true, branchDeleted };
}

module.exports = {
  slugifyBranchPart,
  getRepoInfo,
  listWorktrees,
  createWorktree,
  getWorktreeDiff,
  commitWorktree,
  mergeWorktree,
  removeWorktree,
  isManagedWorktreePath,
};

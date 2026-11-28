import path from 'node:path';
import { exists, readText } from '../lib/fsx.mjs';
import { sourceTreeDrift } from '../lib/skills.mjs';
import { blockVersion, expectedBlockVersion } from '../inject/render.mjs';

/**
 * Verifies that each target harness actually holds what the manifest claims:
 * skill files present with matching hashes, inject block present, gate bundle
 * present for free-form harnesses.
 */
export function runShipGate({ harnesses = [], manifest, skillsSource }) {
  const findings = [];

  for (const harness of harnesses) {
    const record = manifest.harnesses[harness.id] ?? { skills: {}, inject: null, gate: null };

    if (harness.skillsPath) {
      for (const name of Object.keys(record.skills ?? {})) {
        const installed = path.join(harness.skillsPath, name, 'SKILL.md');
        const sourceDir = path.join(skillsSource, name);
        const source = path.join(sourceDir, 'SKILL.md');
        if (!exists(installed)) {
          findings.push({ level: 'error', harness: harness.id, message: `skill 缺失：${installed}` });
          continue;
        }
        // Same judgement as installSkills(): the destination must carry every
        // source file with matching content. Files the destination adds on its
        // own (e.g. codex's agents/openai.yaml inside a skill) are not drift —
        // comparing whole-tree hashes here made every install look inconsistent.
        if (exists(source) && sourceTreeDrift(sourceDir, path.join(harness.skillsPath, name))) {
          findings.push({ level: 'error', harness: harness.id, message: `skill 与源不一致，需要重装：${name}` });
        }
      }
    }

    if (harness.injectPath) {
      if (!exists(harness.injectPath)) {
        findings.push({ level: 'error', harness: harness.id, message: `注入文件缺失：${harness.injectPath}` });
      } else {
        const found = blockVersion(readText(harness.injectPath));
        const expected = expectedBlockVersion();
        if (!found) {
          findings.push({ level: 'error', harness: harness.id, message: `注入文件没有 shipgate 区块：${harness.injectPath}` });
        } else if (expected && found !== expected) {
          // A stale block (e.g. v2 left over from an older release) looks
          // installed but teaches the agent old rules — that is drift too.
          findings.push({
            level: 'error',
            harness: harness.id,
            message: `注入区块是 ${found}，当前版本是 ${expected} —— 重跑 shipgate install：${harness.injectPath}`,
          });
        }
      }
    }

    if (harness.gateDest) {
      if (!exists(harness.gateDest)) {
        findings.push({ level: 'error', harness: harness.id, message: `硬门控产物缺失：${harness.gateDest}` });
      } else if (!exists(path.join(harness.gateDest, 'policy.js'))) {
        findings.push({ level: 'error', harness: harness.id, message: `硬门控产物不完整（缺 policy.js）：${harness.gateDest}` });
      }
    }
  }

  const ok = findings.length === 0;
  return {
    gate: 'ship',
    ok,
    code: ok ? 0 : 1,
    summary: ok ? `${harnesses.length} 个 harness 的产物与 manifest 一致` : `${findings.length} 处产物不一致`,
    findings,
    evidence: { harnesses: harnesses.map((h) => h.id) },
  };
}

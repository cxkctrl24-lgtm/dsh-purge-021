/**
 * 批 0 探针（fork1-b0）——与主日志(`dsh-purge-desktop.log`)完全分离的第二通道。
 *
 * 为什么需要它（见 `dsh-purge-opt/24-diff-review-and-log-freeze.md` §3/§4）：
 *   2026-10-25 21:10:58 → 22:26:26 主日志整整 75 分钟没有新行，而同期本机确实有会话活动。
 *   两种假设当时无法区分：
 *     S1 = purge 的运行时钩子从那刻起不再被调用（fiber 被 dispose / 挂掉）
 *     S2 = 钩子还活着，但主日志每次落盘都失败，被 `flushPurgeLog` 的 `catch {}` 吞掉
 *   主日志自己**永远不会**说出是哪一种（失败没有可见性）。所以这里把
 *   「钩子调用计数 / 主日志落盘成功与失败计数 / 心跳 / apply·dispose 生命周期」
 *   全部写进**另一个文件**：主日志被锁或写不进去时，这个文件照样会说话。
 *
 * 判读：
 *   - `[hb]` 连续 + `calls` 增长 + `flushErr` 增长        → S2（写入失败被吞）
 *   - `[hb]` 连续 + `calls` 不增长（且无装配活动）        → 钩子没被调用
 *   - `[hb]` 断流（探针文件也停）                          → 进程/fiber 整体死亡（S1）
 *   - `[life.dispose]` + `[life.disposeScheduled]` 出现    → 确实发生过 dispose（面板那行会掉出去）
 *
 * 安全约定（探针绝不能影响主流程）：
 *   - 所有写操作 try/catch，失败只累加计数；
 *   - 单文件上限 4MB，超了轮转一次为 `.1`；
 *   - 失败类行【限量】写（首 3 条 + 之后每 50 条 1 条），避免失败风暴；
 *   - 不写宿主 stderr；心跳定时器 unref（不阻止进程退出）。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PROBE_PATH =
  process.env.DSH_PURGE_PROBE_PATH || path.join(os.tmpdir(), "dsh-purge-probe.log");
const PROBE_MAX_BYTES = 4 << 20;
const ERR_SAMPLE_FIRST = 3;
const ERR_SAMPLE_EVERY = 50;

/** 探针自身的计数（心跳行会把这些读出来）。 */
const stats = {
  version: "b0",
  pid: process.pid,
  startedAt: new Date().toISOString(),
  lines: 0,
  /** 探针自己写失败次数（若这个也在涨，说明整个 tmp 都写不进去了）。 */
  selfWriteErrors: 0,
  /** `purgeLog()` 被调用次数——「钩子是否还在被调用」的代理指标。 */
  mainLogCalls: 0,
  /** 主日志成功落盘次数。 */
  mainLogFlushes: 0,
  /** 主日志落盘失败次数——S2 的直接证据。 */
  mainLogFlushErrors: 0,
  lastFlushError: "",
};
let _errLines = 0;

function rot() {
  try {
    const st = fs.statSync(PROBE_PATH);
    if (st.size > PROBE_MAX_BYTES) {
      try { fs.renameSync(PROBE_PATH, `${PROBE_PATH}.1`); } catch { /* 并发失败下次再试 */ }
    }
  } catch { /* 文件不存在 */ }
}

function fmt(tag, kv) {
  let line = `${new Date().toISOString()} [${tag}]`;
  if (kv) {
    for (const k of Object.keys(kv)) {
      const raw = kv[k];
      const v = raw === undefined || raw === null ? "" : String(raw).replace(/\s+/g, "_");
      line += ` ${k}=${v}`;
    }
  }
  return `${line}\n`;
}

/** 写一行探针。`sample: true` 的行受失败采样限制。 */
export function probe(tag, kv, sample = false) {
  try {
    if (sample) {
      _errLines += 1;
      if (_errLines > ERR_SAMPLE_FIRST && _errLines % ERR_SAMPLE_EVERY !== 0) return;
    }
    if ((stats.lines & 0x3f) === 0) rot();
    fs.appendFileSync(PROBE_PATH, fmt(tag, kv), "utf8");
    stats.lines += 1;
  } catch {
    stats.selfWriteErrors += 1;
  }
}

/** 记录一次 `purgeLog()` 调用（钩子活跃度）。 */
export function notePurgeLogCall() {
  stats.mainLogCalls += 1;
  // 每 200 次往探针里落一行，便于事后比对「主日志该有多少行」。
  if (stats.mainLogCalls % 200 === 0) probe("calls", { n: stats.mainLogCalls });
}

/** 记录一次主日志落盘结果。失败时把 err.code 写进探针（限量采样）。 */
export function noteFlush(ok, err) {
  if (ok) {
    stats.mainLogFlushes += 1;
    return;
  }
  stats.mainLogFlushErrors += 1;
  if (err) {
    const msg = `${String(err.code || err.name || "ERR")}:${String(err.message || err).slice(0, 120)}`;
    stats.lastFlushError = msg;
  }
  probe(
    "logfail",
    {
      n: stats.mainLogFlushErrors,
      err: stats.lastFlushError || "-",
      calls: stats.mainLogCalls,
    },
    true,
  );
}

/** 心跳/收尾用的快照。 */
export function probeStats() {
  return { ...stats, errLines: _errLines };
}

export default { probe, probeStats, notePurgeLogCall, noteFlush, PROBE_PATH };
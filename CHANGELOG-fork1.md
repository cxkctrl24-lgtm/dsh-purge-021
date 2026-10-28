# 本次构建：1.1.79-0.2.1.rc.2-fork1

> **构建 2（2026-10-25）**：在同一版本号下追加了性能优化（见 §六）。
> **tgz 已被覆盖**；本文件的 sha256 **不写在这里**（写进来就会改变包自身的哈希）——
> 请以交付消息 / `10-install-fork1.md` 里记录的 sha256 为准。
> 补丁 `fixes-fork1.patch` 同步更新为 975 行。

基线 = 本 fork 的 `1.1.73-0.2.1.rc.2`（你原来装的那版）。
本构建把**上游 `YuJunZhiXue/dsh-purge` v1.1.74 → v1.1.78 的修复定点移植**进来，
另外补了自己排查出来的三处 P0、以及一轮实测过的性能优化。

> 为什么核心号取 **1.1.79**（而不是 1.1.78）：
> `lib/update.js:109 versionIsNewer()` 的 `if (!a.pre && b.pre) return true;` 规定
> 「远端无 pre、本地有 pre」即判远端更新。所以 `1.1.78-…` 会被上游 `1.1.78` 判为更旧，
> 一点「检查更新」就整批覆盖回上游代码（`lib/update.js:20-31 COPY_NAMES` 会覆盖
> `lib/ bin/ docs/ client.js cordis.patch.yml package.json README* LICENSE`）。
> 取 1.1.79 才能真正钉住。实测见 `09-port-install.md` §4.2。

## 一、移植自上游的修复

| 上游版本 | 内容 | 落点 |
|---|---|---|
| 1.1.74 `ba12c91` | `stripToolFilter()`：0.2.1 已废弃 `toolFilter`，旧预设里留着它会让**整份红队预设加载失败** | `lib/redteam/index.js:203` + 自愈管线 `:409 / :461` + 首次安装路径 `:453-467` |
| 1.1.74 `6cb2ac3` | `sealObjectSchemas()`：0.2.1 要求任何 `type:'object'` 显式声明 `additionalProperties` | `lib/redteam/tools.js:81-110` |
| 1.1.75 `6980fe2` | 修 `already queued: dsh-purge`：本体已在 `profile.bundles` 入队，`cordis.patch.yml` 里再 `insert` 一次会冲突 | `cordis.patch.yml:34-53`（把 `config:` 挪到已有 `- id: dsh-purge` 上，删掉重复的 insert 条目；fork 自己的三条红队条目保留） |
| 1.1.76 `dbaf377` | pnpm 安装适配：`pnpm add` 只写 dependencies，不会写 `dsh.profile.bundles` | 新增 `scripts/ensure-profile-bundle.mjs` + `package.json scripts.postinstall`；`dsh.install.*` 改 codeload 形态 |
| 1.1.78 `5d4b45c` | #108：停用/卸载后残留 `selectedDefault=redteam` → **无法新建会话** | 恢复 `lib/preset-default.js`（205 行，逐字节同上游）；`lib/index.js` +14 行（`apply()` 的 `enabled:false` 清理 + dispose 延迟清理）；`lib/uninstall.js` 整覆盖（与上游 v1.1.73–1.1.77 五版逐字节相同，无 fork 定制可丢） |
| 1.1.78 | 扫描面从 `cordis.patch.yml` 扩到 `cordis.yml` | 随 `preset-default.js` 一并带入 |

## 二、本 fork 追加的修复（上游没有）

| # | 问题 | 落点 | 说明 |
|---|---|---|---|
| F1 | **host 被杀时"静默"→ 白屏查无痕迹** | `lib/core.js` 补丁 #83 | 保留"不弹 crash dialog"，但改为向 `<userData>/logs/dsh-purge-host-exit.log` 追加一行（时间/exit code/signal/pid/stderr 摘要）。乐享《DeepSeek Harness 打不开（白屏）排查与解决总结》点名这是"host 死了但查无痕迹"的原因 |
| F2 | **asar 改名失败后不拉起 exe** | `lib/desktop.js` `ASAR_SWAP_PS1` 的 `else` 分支 | 原逻辑只写 `<asar>.rename-pending` 就结束，而宿主侧 `gracefulExit()` 随后无条件 `process.exit(0)` → 客户端消失且不自动回来。现在失败分支也 `Start-Process` 拉起 exe；重入由那个锁挡住（`desktop.js:1056-1059`，30 分钟内直接 `already:true`） |
| F3 | **包内模板自带 `toolFilter`** → 每次全新安装都写出坏预设 | `presets/redteam/agent.cordis.yml:313-317` | 按上游文本删除该块，并把注释改准：0.2.1 下"子智能体是叶子"**只剩 `maxDepth: 1` 一道**，`subagent_fork/workflow/ralph` 的工具名子会话仍可见（原注释声称"连看都看不到"，已不成立） |

## 三、自升级来源钉住

- `lib/update.js:12` `REPO`: `YuJunZhiXue/dsh-purge` → `cxkctrl24-lgtm/dsh-purge-021`
- `lib/update.js:13` `STABLE_REF`: `master` → `main`（fork 只有 main 分支）
- `package.json dsh.install.tarball/zip/git` 一并指向 fork

## 四、验证明细

见 `D:\sw26\dsh-purge-opt\` 下的分报告：
`01-install-path.md`（装机失败面）、`02-session-cost.md`（每步开销量化）、
`03-baseline.md`（只读基线）、`04-new-session-30s.md`（30 s 归因与判别实验）、
`05-upstream-1.1.78-vs-local.md`（上游差异）、`07/08/09-port-*.md`（三次移植的逐项证据）。

本构建自检（全部通过）：`lib bin scripts` 共 58 个 JS `node --check` 全过；
8 个关键模块 `import()` 全成功；`package.json` JSON 合法；
生成的 `ASAR_SWAP_PS1` 经 Windows PowerShell 5.1 `PSParser` 校验 0 错误（527 tokens）；
`versionIsNewer('1.1.78','1.1.79-0.2.1.rc.2-fork1') === false`（钉住生效）。

## 五、已知残留（未在本构建解决）

1. **30 秒新会话仍未定案**：purge 侧实测只占 120–170 ms（≈0.5%）。三个仍未排除的候选与判别实验见 `04-new-session-30s.md` §3。
2. `sealObjectSchemas` 的两个盲区（参数表形态不下钻、不遍历 `oneOf`）—— 上游靠 5 处字面补丁兜底，本 fork 无那 5 处；**当前暴露为零**（fork 现存 4 个 `type:'object'` 节点均已显式声明），但未来把 `evidence_*` / `unknown_*` 工具搬回来时必须连 `additionalProperties` 一起搬。
3. 「残留 toolFilter 纳入 `needsCompositionRepair`」这条本地补强**已按权衡撤回**（它等价 `force` 整份覆盖用户预设；就地剥离已够）。
4. 未做端到端装机验证（装包后 `~/.dsh/redteam/preset-declare.json` 的 `phase` 应从 `registered-broken` 变 `registered`）。

## 六、构建 2 追加的性能优化（本轮）

依据是 `02-session-cost.md` 的实测：**每 1 次 prompt 装配 = 3 次 `inject.read` + 2 次 `assemble.rewrite`**，
而装配调用次数是模型步数的 **13–14.5 倍**。这一轮只做**可证明不改语义**的三项：

| # | 改动 | 落点 | 实测收益 |
|---|---|---|---|
| P1-6 | **日志批量写**：原来每行一次 `fs.appendFileSync`（每装配 6 次同步 syscall）→ 现在攒进内存、够 8KB 或距上次 ≥250ms 才合并一次落盘，并在 `exit`/`beforeExit` 强制 flush | `lib/index.js` 日志块 | 同步 syscall 从 6 次/装配 → ≤0.25 次/秒 |
| P1-3 | **`HUNG_CACHE_MS` 200 → 30_000**，并把缓存键从 mtime 换成 **(mtime:size) 戳**（size 也纳入，防外部工具保留 mtime 改内容） | `lib/index.js` `refreshHungOperator` | 省 3 × 1.318ms + 3 × 25KB 磁盘读 / 装配 |
| P1-7 | **只在戳变化（或换 home）时才调 `syncPromptInjectOnDiskSync`** | 同上 | 稳定态下省掉每装配 3 次 25KB 原子写检查 |
| P1-4 | **`injectMatchers` 模块级缓存**（键 = 注入正文） | `lib/identity.js` | `leadWithInject` 单次 **0.042 → 0.022 ms（-46%）**（真实 21K 注入正文 + 37 段 ×3KB 口径） |

**等价性证据**（旧 vs 新同输入对拍，脚本在 `fixed/_verify/`）：
- 日志：24 行 × 去时间戳后**逐字节相同**（`perf-idx-logdiff.mjs`）
- 注入装配：3 组用例（含注入 / 不含注入 / 空注入）输出**逐字节相同**（`perf-ident-diff.mjs`）
- 真实体量基准：输出仍逐字节相同（`perf-ident-bench.mjs`）
- 全树 58 个 JS `node --check` 全过；`lib/identity.js` / `lib/index.js` 等 4 个关键模块 `import()` 正常

**未做**（留给下一轮，理由见 `15-perf-round1.md` §3）：P1-1 装配超频的调用方定位与去重、
P1-2 双重重写消除、P2 补丁 #55 回退、注入正文压缩。这几项动的是注入语义本身，需要更强的对拍网兜。

## 七、构建 3 追加：修「用户改的注入正文会被静默覆盖回内置默认」

**症状**：改了 `~/.dsh/prompt-inject.md`，下一次装配就被还原。**连 UI 点保存也救不回。**

**根因**（`lib/core.js`）：`PLUGIN_DEFAULT_MARKS = ["<|im_start|>system:", "<project_instructions>", "Little Code Sauce"]`
这条「插件默认血统」判据被当成**一票否决**：

- `isKeepableUserOverride()` 里它排在 `customized` 标记**之前**且无条件执行；
- `installOverride()`（保存路径）的「保留用户正文」分支被 `&& !looksLikePluginDefault(disk)` 挡住，
  于是落到 `fsp.writeFile(fp, bundled)` 把用户正文盖成内置默认。

而**用户自己改的稿子必然同时含这三句**（它本就建立在这套血统上），所以这两条路都恒不成立。
本机实测：三标记在用户文件里的命中次数 = **1 / 1 / 4**，全部命中。

**修复**：血统标记从一票否决降级为**无用户证据时的兜底**，并引入 mtime 证据：

```
① 与当前内置默认逐字节相同                → 不是自定义
② state.customized === true               → 是用户自定义（最高优先，任何启发式不能推翻）
③ 内容与 state.hash / state.seedHash 相同  → 是我们自己写的
④ 文件 mtime 晚于我们上次落盘(updatedAt)   → 是用户改的
⑤ 以上都不成立、又含血统标记               → 当旧默认刷掉（升级迁移行为保留）
```

**验证**：`fixed/_verify/override-keep-matrix.mjs`，假 DSH_HOME + 真实模块 vs `git HEAD` 旧逻辑对拍，
**6/6 通过**；与改前行为不同的仅 2 例（T2 `customized:true`、T3 mtime 证据），都从 false 变 true；
T4「旧版本内置默认」仍为 false（**迁移行为未回归**）。
## 八、构建 4 追加：可见性探针（b0）+ **cordis.patch.yml 主行修复**（b0-1）

版本号 `1.1.79-0.2.1.rc.2-fork1-b0-1`。

### 8.1 b0 —— 探针通道（排查「静默」用）

新增 `lib/probe.js`：**独立**通道 `%TEMP%/dsh-purge-probe.log`，不受主日志的批处理、`rotatePurgeInternalLog()` 与 3 MB 轮转影响——主日志出问题时它仍然能写。

| 标记 | 落点 | 含义 |
|---|---|---|
| `life.module` | `lib/index.js` 模块顶层 | 模块被求值过（**有**它却无 `life.apply` = 装配层丢掉了插件） |
| `life.apply` / `life.dispose` | `lib/index.js` | 父插件挂载 / 卸载 |
| `hb`（含 `calls` / `upSec`） | 30 s 心跳 | 存活证明；`calls` 是 purgeLog 调用计数 |
| `logfail` | 主日志落盘 catch | 原来这里是纯 `catch {}`——「hooks 死了」与「落盘全失败」在主日志里长得一模一样 |
| `life.disposeScheduled` / `life.disposeClear` | `lib/preset-default.js` | 停用后 800 ms 延迟清理的**是否真的发生**、清掉几个文件 |
| `life.presetDirRm` | 同上 | 用户红队预设目录是否被 `rm -rf`（含 `deleted:false` 的原因码） |
| `life.redteam.apply` / `life.redteam.dispose` | `lib/redteam/index.js` | 子容器自己的挂载/卸载，用来区分「父重挂」与「子被重挂」 |

### 8.2 b0-1 —— ★ 修复：父插件永不装载

**症状**：装上新包并重启后，右侧面板里没有 dsh-purge，主日志里**连 `[boot]` 都没有**，钩子全部失效。

**根因**：fork1 为了修上游 1.1.75 的 `already queued: dsh-purge`，把 `cordis.patch.yml` 主行从 `insert:` 改成 `- id: dsh-purge` + `inject`。但本 profile 里 `dsh-purge` **只存在于 `dsh.profile.bundles`**（入口由宿主按 bundles 派生），补丁层再没有任何条目去创建它——于是组合器报

```
patch: entry "dsh-purge" not found
```

整条条目被丢弃，父插件从未装载。**判据**：有 `[life.module]` 而无 `[life.apply]` = 模块被 import 了、装配层却把它丢了。

**修复**：主行改回 `insert:`（`name` / `inject` / `config` 都写在 insert 条目上），fork 自己的 5 条红队条目保留。教训写死成规则：**bundle patch 的主行必须用 `insert:` 创建，不能用 `- id:` 覆盖**。

### 8.3 b0-1 附带：补丁正文变更必须带迁移腿

`lib/core.js` 的补丁 #83（`DESKTOP_HOST_CLOSE_NO_FATAL`）在 fork1 里改过**载荷正文**（F1：向 `<userData>/logs/dsh-purge-host-exit.log` 追加宿主退出诊断），但 marker 两版都是 `[dsh-purge] signal kill`。已经落过**旧**载荷的机器被当成 `applied` → **永不重放**，F1 恰好是查「host 死因」的唯一取证手段。

本次给 #83 的 `replacements` 最前面加了一条迁移腿（旧注释行 → 新注释 + `try{mkdirSync/appendFileSync…}catch{}`），副本预演命中 1 次、含全部 F1 特征串、`resolve();return;` 分支保留、`node --check` 通过。

**规则**：改已发布 patch 的载荷正文 → 要么带迁移腿，要么换新 marker。

### 8.4 落库（发布到 GitHub 时）注意

- `lib/core.js.bak-before-f1migration` 是打包时的临时备份，**不进仓库**（README 与 `.gitignore` 已覆盖 `node_modules/`、`*.tgz`、`*.log`）。
- `scripts/ensure-profile-bundle.mjs` 的 `postinstall` 会被 pnpm 默认拦截，需在 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds` 里放行；且**键是文件说明符**（`dsh-purge@file:vendor/<tgz>`），换文件名就会多出一条待决项。

## 九、b0-2（2026-10-28）：去掉 `postinstall`，改为可手动调用的脚本

**动机**：pnpm 11 默认拦截依赖的构建脚本。从 DSH 插件市场装本包时，pnpm 把 `scripts.postinstall` 记为待审批，安装流程停在「构建脚本被 pnpm 默认拦截（dsh-purge），点击「放行构建脚本并重试」即可放行并重装」——每换一次 tgz 文件名，`allowBuilds` 的键（文件说明符）就多一条待决项，用户必须逐次点放行。

**处置**：

- `package.json`：`scripts.postinstall` → `scripts.ensure-profile-bundle`（同名普通脚本，**不再自动触发**）。要手工补 `dsh.profile.bundles` 时执行 `npm run ensure-profile-bundle`。
- 其余与 b0-1 **逐字节相同**（`lib/` 一个字节都没动，含 b0 探针、`cordis.patch.yml` 的 insert 修法、#83 的 b0-2 迁移腿）。
  > 对照口径：与**仓库里的 b0-1 树**比，只有 `package.json`（version + scripts）与本文不同。与**发布出去的 b0-1 tgz**比，本包还多一样东西——那次打包发生在迁移腿落盘之前，所以 b0-1 tgz 里的 #83 只有 F1 载荷、没有迁移腿；b0-2 是第一次把迁移腿真正发出去的构建。装机升到 b0-2 之后，#83 才会从「假 applied」变成真修（判据见 §8.3）。
- 版本号 → `1.1.79-0.2.1.rc.2-fork1-b0-2`，便于 `purge_status` 里区分线上跑的是哪份。

**代价（已接受）**：`pnpm add dsh-purge@file:…` 之后不会再自动往 `~/.dsh/profiles/<profile>/package.json` 的 `dsh.profile.bundles` 里补行。本机该字段本来就是手工维护的，且市场安装路径由宿主自己写 bundles，不依赖此脚本。

### 9.1 §8.4 的第二条已作废

§8.4 曾要求「在 `allowBuilds` 里放行 `dsh-purge@file:vendor/<tgz>`」。b0-2 起**不再需要**：包里没有任何构建脚本，`allowBuilds` 里那两条 `dsh-purge` 键可以留着（对无脚本的包不生效）也可以删掉。

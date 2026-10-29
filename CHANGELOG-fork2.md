# fork2 · 基于上游 1.1.82 重建（2026-10-29）

> 上一轮 fork1 的基座是 **1.1.73**，此后上游已发到 **1.1.82**（1.1.79 / 1.1.80 / 1.1.81 / 1.1.82 四个版本、约 1300 行差异）。
> 继续在旧基座点对点打补丁会越来越难对齐，因此本轮**把上游 1.1.82 整棵树拿来做新基座**，再把 fork 增量逐条移植回来。

## 0. 版本与许可

| 项 | 值 | 说明 |
|---|---|---|
| version | `1.1.83-0.2.1.rc.2-fork2` | **核心号必须抬到 1.1.83**。`versionIsNewer()` 的 `splitVersion` 只比 core 三位；停在 `1.1.79-…` 会被上游 `1.1.82` 判为「有更新」，一点「检查更新」就整批覆盖回上游（`COPY_NAMES` 会覆盖 `lib/ bin/ docs/ client.js cordis.patch.yml package.json README* LICENSE`），全部 fork 增量丢失。实测：`versionIsNewer("1.1.82","1.1.83-…fork2") === false` ✓ |
| license | **Apache-2.0**（随上游） | 上游在 1.1.8x 从 MIT 改为 Apache-2.0，并新增 `NOTICE`（写明「衍生作品必须保留本 NOTICE 与署名」）。fork 必须同步：`LICENSE` / `NOTICE` 不得删改。上一轮 fork1 树里的 `LICENSE` 还是 MIT + 「Copyright 小杨」，**本轮已随新基座纠正** |
| 自升级源 | `lib/update.js` 的 `REPO` → `cxkctrl24-lgtm/dsh-purge-021`、`STABLE_REF` → `main`；`package.json dsh.install.*` 三处 → fork | 与核心号抬升是双保险：拦的是两条不同路径（检查更新 / 安装入口） |

## 1. 上游 1.1.79–1.1.82 带来的东西（直接继承，不用再打补丁）

| 版本 | 内容 | 对本 fork 的意义 |
|---|---|---|
| 1.1.79 | #165 ds-bot 按桌面宿主识别；**#166 pnpm 拦 postinstall 时补 allowBuilds**；**#167 升级后补回 bundles + 本体 insert**；应用进度条跟 job 阶段；新建会话不再把芯片甩到行尾 | #166/#167 正是我们此前**手工**做过的两件事，现在有代码维护了 |
| 1.1.80 | **#168 allowBuilds 也覆盖 `dsh-purge@codeload…` 键**；#169 芯片/按钮强制系统字体；#170 纯 Node 解 zip 目录条目；**#172 skills.js 补 fs，软链重叠守卫恢复**；#176 声明不支持 0.2.1-rc.3+ | #168 与我们此前诊断的「键必须是文件说明符」完全一致，且做得更完整 |
| 1.1.81 | #174 识别 DSH NEXT 社区桌面；#175 补单测（23 条）；#171/#173 用测试锁住 | |
| 1.1.82 | **#180 修 allowBuilds 被反复写坏**（畸形键 / 重复键 / URL 键被冒号截断 / 期望键优先读 lock 实际 URL / 写前 YAML 校验 / 健康文件零写入） | 我们此前靠手工改 `pnpm-workspace.yaml` 解决的根因，上游已修 |

新增文件：`lib/profile-insert.js`（368 行，补 bundles + 本体 insert + allowBuilds）、`lib/apply-progress.js`、`lib/redteam/evidence-ledger.mjs`、`lib/default-prompt-inject.{en,zh}.md`、`test/`（6 个测试文件，36 条）。
另有协议/合规件：`LICENSE`（Apache-2.0 全文）、`NOTICE`（衍生作品保留声明）、`LICENSE-COMMERCIAL.md`、`docs/notice`、`README.ja.md`。

打包结果：`dsh-purge-1.1.83-0.2.1.rc.2-fork2.tgz`，**95 个文件**（`test/` 不进包，与上游一致）；sha256 `eb4fe135…538a`。

## 2. fork 增量（全部移植到 1.1.82 上，逐条断言命中后写盘）

| # | 增量 | 落点 | 上游有没有 |
|---|---|---|---|
| **F1** | 宿主被信号杀时写 `<userData>/logs/dsh-purge-host-exit.log`（时间/exit code/signal/pid/stderr 摘要） | `lib/core.js` 补丁 #83 的载荷 | **没有**（1.1.82 的 #83 仍是旧载荷，只静默 resolve） |
| **F2** | asar 改名失败也拉起客户端（原逻辑只写 `<asar>.rename-pending` 就结束，宿主随后无条件 `process.exit(0)` → 客户端消失且不自动回来） | `lib/desktop.js` `ASAR_SWAP_PS1` 的 `else` 分支 | **没有**（1.1.82 的失败分支仍只写锁） |
| **G10** | 覆盖判定：血统三句从「一票否决」降级为「无用户证据时兜底」，并引入 `customized` 标记与 mtime 证据 → 手改 `prompt-inject.md` / 点保存不再被盖回内置默认 | `lib/core.js` `isKeepableUserOverride` + `installOverride` | **没有**（1.1.82 仍把 `looksLikePluginDefault` 当一票否决） |
| **P1-3/P1-7** | hung 缓存 TTL 200ms → 30s；缓存键从 mtime 换成 `(mtime:size)` 戳；只在戳变/换 home 时才 `syncPromptInjectOnDiskSync` | `lib/index.js` `refreshHungOperator` | **没有**（1.1.82 仍是 200ms + 纯 mtime） |
| **P1-4** | `injectMatchers` 模块级缓存（键 = 注入正文） | `lib/identity.js` | **没有** |
| **P1-6** | 日志批量写（250ms / 8KB 双门 + 退出强刷），从每装配 6 次同步 syscall 降到 ≤4 次/秒 | `lib/index.js` `purgeLog`/`flushPurgeLog` | **没有** |
| **b0 探针** | 独立第二通道 `%TEMP%/dsh-purge-probe.log`：`life.module` / `life.apply` / `life.dispose` / `life.disposeScheduled` / `life.disposeClear` / `life.presetDirRm` / `life.redteam.apply` / `life.redteam.dispose` / 30s `hb` 心跳 / `logfail` 落盘失败采样 | `lib/probe.js`（新）+ index / preset-default / redteam-index 三处挂接 + 主日志 `catch{}` 改为记账 | **没有** |

**F3（模板 `toolFilter`）已不需要**：上游 1.1.8x 已在模板里删掉该块并留下说明（`presets/redteam/agent.cordis.yml:318` 注释「0.2.1-rc.2 已废弃 toolFilter（#138）」）。

## 3. 上游 1.1.82 已经替我们解决的

- **「主行必须用 insert 创建」**：1.1.82 的 `cordis.patch.yml` 主行仍是「id 覆盖 + name」，但它配套的 `lib/profile-insert.js` 会在用户层 `profile/cordis.patch.yml` **补一条 insert**（postinstall / 演练台自愈 / 升级后三处都调）。这比我们上一版把 insert 塞进包内 overlay 更稳——包内 overlay 会被 `already queued` 挡住，用户层才是正确位置。
  > 因此本 fork2 **不再改包内 `cordis.patch.yml` 的主行形态**，沿用上游；只在文档里保留这条规则作为排查知识。
- **allowBuilds 的一整套坑**（畸形键、URL 截断、重复键、期望键优先读 lock）由 #180 解决。

## 4. 验证

| 项 | 结果 |
|---|---|
| 语法 | `lib` / `bin` / `scripts` 全部 JS + `client.js` → `node --check` **0 错** |
| 单测 | `npm test` → **36/36 pass**（上游 23 + 上游后续新增，含 #180 的 round-trip 系列） |
| 模块装载 | `import('./lib/probe.js')`、`import('./lib/core.js')` 正常（core 导出 132 项） |
| 版本钉住 | `versionIsNewer("1.1.82","1.1.83-0.2.1.rc.2-fork2") === false`；`(…,"1.1.79-…fork1-b0-2") === true`（印证必须抬核心号） |
| 测试夹具 | `test/profile-insert.test.js` 的期望 URL 改为从本包 `package.json` 的 `dsh.install.tarball` 读（硬编码上游 master 会让测试变成"钉住上游仓库"）；「lock 只有 specifier」那条改成断言 lock 里实际 URL，而不是固定仓库 |

## 5. 与上一版（fork1-b0-2）的差异摘要

- 基座 1.1.73 → **1.1.82**（+4 个上游版本、约 1300 行、6 个新模块、36 条测试）
- 许可 MIT → **Apache-2.0**，补 `NOTICE`（合规必须）
- 核心号 1.1.79 → **1.1.83**（钉住上游更新）
- 包内 `cordis.patch.yml` 主行改回上游形态（由 `profile-insert.js` 在用户层补 insert）
- fork 增量从「点对点补丁」变为「在新基座上重放并断言命中」，每处都带 `[fork xxx]` 标记，便于下次上游升级时用 `grep -n "\[fork"` 全量定位

## 6. 下次上游再更新时的流程（降低再犯成本）

1. 下载新 tag 到 `_upstream/vX`，`diff -rq` 出差异面；
2. `grep -rn "\[fork" lib/ | sort` 列出全部 fork 锚点；
3. 逐条核对锚点在新基座里是否还在（本轮的 `port-*.mjs` 脚本就是模板，命中数不符即整体失败、不写盘）；
4. 核心号继续抬（新上游 minor 或 patch +1），保证 `versionIsNewer` 判旧；
5. `npm test` 必须全绿再打包。
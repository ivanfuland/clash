# A5 Two-Route Blacklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增只包含默认节点仓库、国外分流和国内分流的 A5 黑名单配置，并让订阅 Worker 支持 `config=a5`。

**Architecture:** `Clash-A5.ini` 只负责三个策略组；`Clash-A5-Base.yaml` 负责 DNS、Rule Provider 和两类规则目标；Worker 只增加 A5 配置映射和响应名称。A1 至 A4 不修改。

**Tech Stack:** SubConverter INI、Mihomo YAML、Cloudflare Workers JavaScript、PowerShell

## Global Constraints

- 规则层只引用 `🌐 国外` 和 `🏠 国内` 两个业务分流。
- `🔰 默认代理` 收录全部节点并由用户直接选择单节点。
- 不创建地区、测速、故障转移、住宅或 AI 专用节点组。
- 广告使用 `REJECT`，Tailscale 使用 `DIRECT`。
- 最终 `MATCH` 指向 `🏠 国内`。
- 保持 Mihomo、OpenClash 和 Stash 的现有兼容规则。
- 不提交或推送。

---

### Task 1: 增加 A5 结构校验

**Files:**
- Create: `tests/a5-config.tests.ps1`

**Interfaces:**
- Consumes: `Clash-A5.ini`、`Clash-A5-Base.yaml`、`workers/sub-yaml-worker.js`
- Produces: 失败时退出码 `1`，通过时退出码 `0`

- [ ] **Step 1: 编写失败校验**

校验 A5 文件存在、INI 仅定义三个策略组、Base 规则不引用旧业务组、Worker 包含 A5 映射与显示名称。

- [ ] **Step 2: 运行校验并确认失败原因**

Run: `pwsh -NoProfile -File tests/a5-config.tests.ps1`

Expected: FAIL，提示 `Clash-A5.ini` 或 `Clash-A5-Base.yaml` 不存在。

### Task 2: 新增 A5 配置

**Files:**
- Create: `Clash-A5.ini`
- Create: `Clash-A5-Base.yaml`

**Interfaces:**
- Consumes: A2 的 DNS、Rule Provider、Tailscale 和 Stash 兼容非中国 IPv4 规则
- Produces: SubConverter 可读取的 A5 配置 URL

- [ ] **Step 1: 新增 `Clash-A5.ini`**

只定义：

```ini
custom_proxy_group=🔰 默认代理`select`.*
custom_proxy_group=🌐 国外`select`[]🔰 默认代理
custom_proxy_group=🏠 国内`select`[]DIRECT
```

- [ ] **Step 2: 新增 `Clash-A5-Base.yaml`**

复用 A2 基础配置，将 MyAnthropic、MyOpenAI、Futu、Mine1 和所有 GEOSITE 国外业务规则统一指向 `🌐 国外`，最终使用 `MATCH,🏠 国内`。

- [ ] **Step 3: 运行校验并确认只剩 Worker 映射失败**

Run: `pwsh -NoProfile -File tests/a5-config.tests.ps1`

Expected: FAIL，提示 Worker 尚未支持 A5。

### Task 3: 增加 Worker A5 映射

**Files:**
- Modify: `workers/sub-yaml-worker.js`

**Interfaces:**
- Consumes: 查询参数 `config=a5`
- Produces: `Clash-A5.ini` 转换结果，响应名称 `聚合优选-简化版`

- [ ] **Step 1: 增加 A5 显示名称、配置 URL 和参数别名**

在 `DISPLAY_NAMES`、`configMap`、短参数识别和错误信息中加入 A5。

- [ ] **Step 2: 更新 Worker 版本号**

将版本号更新为包含 A5 含义的日期标识，使远端配置 URL 变化并避免继续使用旧结果。

- [ ] **Step 3: 运行完整校验**

Run: `pwsh -NoProfile -File tests/a5-config.tests.ps1`

Expected: PASS。

- [ ] **Step 4: 检查差异与工作区状态**

Run: `git diff --check`、`git diff -- Clash-A5.ini Clash-A5-Base.yaml workers/sub-yaml-worker.js tests/a5-config.tests.ps1`

Expected: 无空白错误；A1 至 A4 文件无修改。


# A5 双分流黑名单模式设计

## 背景

A2 按 OpenAI、Anthropic、编程、社交、投资、流媒体等业务拆分策略组，适合精细控制。A5 面向简单日常使用场景，减少策略组数量和人工维护成本。

## 目标

- 规则层只使用 `🌐 国外` 和 `🏠 国内` 两个业务分流。
- 保留 `🔰 默认代理` 作为节点仓库，用户直接选择单个节点。
- 不生成地区、自动测速、故障转移、住宅和 AI 专用等内部节点组。
- 使用黑名单模式：明确识别为国外的流量走 `🌐 国外`，未匹配流量走 `🏠 国内`。
- 保持 Mihomo、OpenClash 和 Stash 共用同一份订阅配置。

## 策略组

```ini
custom_proxy_group=🔰 默认代理`select`.*
custom_proxy_group=🌐 国外`select`[]🔰 默认代理
custom_proxy_group=🏠 国内`select`[]DIRECT
```

`🔰 默认代理` 收录全部下游节点。A5 不创建其他节点筛选或健康检查组。

## 规则

- 广告规则继续直接使用 `REJECT`。
- Anthropic、OpenAI、编程、社交、投资、Meta、流媒体、Google、Microsoft、自定义 `Mine1` 统一指向 `🌐 国外`。
- Tailscale 域名和 CGNAT 地址继续直接使用 `DIRECT`。
- 私有地址指向 `🏠 国内`。
- `GEOSITE,geolocation-!cn` 和 Stash 兼容的非中国 IPv4 组合规则指向 `🌐 国外`。
- 最终 `MATCH` 指向 `🏠 国内`。

`DIRECT` 和 `REJECT` 是规则动作，不属于业务分流组。

## 文件变更

- 新增 `Clash-A5.ini`，定义三个策略组，不创建细分节点组。
- 新增 `Clash-A5-Base.yaml`，复用现有 DNS、Rule Provider 和跨客户端兼容规则，只调整规则目标。
- 修改 `workers/sub-yaml-worker.js`，增加 `config=a5` 和显示名称 `聚合优选-简化版`。

## 验收条件

- A5 转换结果包含实际节点。
- `proxy-groups` 仅包含 `🔰 默认代理`、`🌐 国外`、`🏠 国内`。
- 规则中不存在 OpenAI、Anthropic、编程、社交、投资等业务策略组引用。
- 未匹配规则最终进入 `🏠 国内`。
- Worker 能识别 `config=a5`，并返回 A5 响应标识。
- A1 至 A4 行为不发生变化。


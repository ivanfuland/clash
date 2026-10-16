# 路由器侧：Tailscale UDP 放行（OpenClash + nftables tproxy）

## 为什么必须有这一段

Tailscale 对外广播的端点是 **(家宽公网地址, STUN 观察到的源端口)**。
要让它稳定等于 `<家宽IP>:41641`，两个条件缺一不可：

1. 包出 WAN 时源端口未被改写；
2. 该端口有入站兜底（路由器上的 `41641/udp → 内网地址:41641` DNAT），它同时把出站映射钉在 41641。

在 OpenClash 的场景里这两条其实是**同一个条件**：
这条流必须在**进入 tproxy 之前**被放行。

## 为什么不能放在 Clash 规则层（2026-10-16 实测）

tproxy 把 LAN 的 UDP 交给 mihomo 之后，客户端原来的 socket 已经不存在；
mihomo 判 DIRECT 时只能用自己的 socket 重发，源端口由内核重新分配。

| 观测 | 值 |
|---|---|
| conntrack 两条同目的、同载荷长度的并列流 | `src=192.168.2.50 sport=41641` / `src=<家宽IP> sport=56026` |
| mihomo 出口 socket 源端口分布（目标 DERP:3478） | `56026` × 74，另 1 条随机 |
| 端点表 | 同时出现 `<家宽IP>:41641`、`:56026`、`:60107` |

Clash 层的 `AND,((SRC-PORT,41641),(NETWORK,udp)),DIRECT` **确实会命中**
（路由器内核 `/rules` 中 `hitCount=3`，会话显示 `chains=['DIRECT'] rule=AND`），
但它能做的只剩"不让这条流漏到节点"，给不了固定端点。

因此该规则**已从规则基底移除**：规则基底是全客户端公用的（路由器、Windows、移动端），
而这段只在"路由器后面那台跑 Tailscale 的机器"上成立。

## 两层结构

| 层 | 落点 | 角色 | 失效后果 |
|---|---|---|---|
| nft 放行 | `openclash-tailscale-udp-bypass.sh` → 路由器 `/etc/openclash/custom/openclash_custom_firewall_rules.sh` | **保证层**：包不进 tproxy，保住源端口 41641 | 规则丢失则漏进 tproxy，端点被改写 |
| Clash 自定义规则 | `openclash-tailscale-udp-bypass.custom-rules.list` → 路由器 OpenClash 的"自定义规则" | **兜底层**：nft 层丢失时不让这条流漏到节点 | 无（nft 在位时它是死规则） |

### 兜底层为什么放路由器侧，而不是 rules 基底

    AND,((SRC-IP-CIDR,192.168.2.50/32,no-resolve),(SRC-PORT,41641),(NETWORK,udp)),DIRECT

`Clash-A*-Base.yaml` 是全客户端共用的（路由器、Windows、移动端），
而这条只在"路由器后面那台跑 Tailscale 的机器"上有意义。
放共用基底里既污染其它客户端，又表达不了这层专属关系。

**预期行为：nft 放行规则在位时，这条的命中数恒为 0**
（包在 nft 就 `return` 了，根本到不了 mihomo）。命中数为 0 **不是**失效信号。

## 生效方式

把 `openclash-tailscale-udp-bypass.sh` 的内容追加到路由器上的
`/etc/openclash/custom/openclash_custom_firewall_rules.sh`。
OpenClash 每次启动会执行该钩子（启动日志显示 `Start Add Custom Firewall Rules`），
写进去之后规则不再是一次性的。

## 验收判据

| 判据 | 期望 |
|---|---|
| A 直连 | `tailscale ping <对端>` 输出不含 `DERP`，延迟为 ms 级 |
| B 固定端口 | 同一行里的端口等于 41641；`endpoints changed` 只收敛到 `<家宽IP>:41641`，不再累积随机端口 |
| 持久化 | 重启一次 OpenClash 后规则仍在（`nft list chain inet fw4 openclash_mangle \| grep 41641`） |
| 兜底层存在 | 路由器生效配置里能搜到那条 `AND` 规则（查"存在性"，不要看命中数） |

只看 A 会漏判：2026-10-16 上午 A 一直正常，而 B 已经在退化。

## 回滚

    nft -a list chain inet fw4 openclash_mangle | grep tailscale-udp-bypass
    nft delete rule inet fw4 openclash_mangle handle <handle>

并从 `openclash_custom_firewall_rules.sh` 删除本段。
回滚后果：端点的端口开始漂移，直连时断时续；不会断网（Tailscale 会退到 DERP，约 300 ms）。
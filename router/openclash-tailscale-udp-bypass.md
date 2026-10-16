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

## 自定义规则落点（2026-10-16 设备实测）

兜底层**不是**写进文件就生效，落点与开关都有约束。以下事实从设备上的脚本读出：

| 事实 | 出处 |
|---|---|
| `enable_custom_clash_rules` 是**总开关**，默认 0；两个自定义规则文件共用它 | `/usr/lib/lua/luci/model/cbi/openclash/config-overwrite.lua:449` |
| `custom_rules` → `/etc/openclash/custom/openclash_custom_rules.list`，界面标注 (Priority)，整体前置 | 同文件 :453，`yml_rules_change.sh:135` |
| `custom_rules_2` → `/etc/openclash/custom/openclash_custom_rules_2.list`，界面标注 (Extended)，插到 `DST-PORT,80/MATCH` 锚点之前 | 同文件 :474，`yml_rules_change.sh:136` |

两条约束：

1. **开关是共用的。** 只写文件不开开关，规则到不了内核；而开开关会**连带激活 (Priority) 那份文件**。若那份文件是完整规则集（末尾 `MATCH,🌐 国外`），它会整体前置到订阅规则之前，把后面的规则全部吃掉——等于换掉整套路由。**不要在不确定其内容的情况下打开这个开关。**
2. **bottom 位置对本用途无效。** 本规则要拦的是"目的为公网 IP 的 UDP"，在订阅规则里 `AND,((IP-CIDR,0.0.0.0/0,no-resolve),(NOT,((GEOIP,CN,no-resolve)))),🌐 国外` 会先命中并把它送到节点；插在底部的规则永远轮不到。**本规则必须落在该条之前（顶部区域）。**

推荐顺序：

1. **首选：先把 nft 钩子写好**（`openclash-tailscale-udp-bypass.sh`）。这才是根治——钩子生效后，"nft 规则被重启抹掉"这个失效场景基本消失，兜底层的必要性随之下降。
2. 若仍要兜底层：用 OpenClash 的**自定义覆写脚本**钩子（启动日志显示 `Start Running Custom Overwrite Scripts`）在规则表顶部注入，避开共用开关；或把 (Priority) 文件内容先备份、只留本规则，再开开关。
3. **不要把本规则留在 (Extended) 底部**：那个位置拦不到，会造成"以为有兜底、其实没有"。

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
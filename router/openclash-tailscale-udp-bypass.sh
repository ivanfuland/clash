#!/bin/sh
# Tailscale UDP 放行（路由器侧，OpenClash + nftables tproxy）
#
# 作用：让指定主机发往 41641 端口的 UDP 在进入 tproxy 之前直接 return，
#       使源端口不被 mihomo 改写，从而保住对外广播的固定端点 <家宽公网IP>:41641。
#
# 用法：把本段追加到 /etc/openclash/custom/openclash_custom_firewall_rules.sh
#       （OpenClash 每次启动都会执行该钩子，日志里显示 "Start Add Custom Firewall Rules"）。
#
# 注意：源地址按实际环境修改。规则是路由器专属配置，
#       不要写进全客户端公用的 rules 基底（见同目录 .md 说明）。

TS_SRC_IP="192.168.2.50"    # 跑 Tailscale 那台机器的内网地址
TS_SRC_PORT="41641"         # tailscaled 固定使用的 UDP 源端口
OC_CHAIN="openclash_mangle"

command -v nft >/dev/null 2>&1 || { echo "nft not found, skip tailscale bypass"; return 0 2>/dev/null || exit 0; }
nft list chain inet fw4 "$OC_CHAIN" >/dev/null 2>&1 || { echo "chain inet fw4 $OC_CHAIN not ready, skip tailscale bypass"; return 0 2>/dev/null || exit 0; }

if nft list chain inet fw4 "$OC_CHAIN" | grep -q "tailscale-udp-bypass"; then
    echo "tailscale bypass rule already present"
else
    nft insert rule inet fw4 "$OC_CHAIN" \
        ip saddr "$TS_SRC_IP" udp sport "$TS_SRC_PORT" \
        counter return comment "tailscale-udp-bypass" \
        && echo "tailscale bypass rule inserted"
fi
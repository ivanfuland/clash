export default {
  async fetch(request) {
    const url = new URL(request.url);

    const workerVersion = "2026-06-11-a1-a2";

    if (url.pathname === "/_version") {
      return Response.json({
        name: "clash-sub",
        version: workerVersion,
      });
    }

    if (url.pathname !== "/sub.yaml") {
      return new Response("Not Found", { status: 404 });
    }

    if (url.searchParams.get("token") !== "jhyx") {
      return new Response("Unauthorized", { status: 401 });
    }

    const configMap = {
      a1: "https://raw.githubusercontent.com/ivanfuland/clash/refs/heads/main/Clash-A1.ini",
      a2: "https://raw.githubusercontent.com/ivanfuland/clash/refs/heads/main/Clash-A2.ini",
    };

    const rawConfig =
      url.searchParams.get("config") ||
      url.searchParams.get("profile") ||
      url.searchParams.get("rule") ||
      (url.searchParams.has("a1") ? "a1" : "") ||
      (url.searchParams.has("a2") ? "a2" : "") ||
      "a2";

    const configName = rawConfig
      .toLowerCase()
      .replace(/^clash-/, "")
      .replace(/\.ini$/, "");

    if (!configMap[configName]) {
      return new Response("Bad Request: config must be A1 or A2", { status: 400 });
    }

    const target = new URL("http://converter.judyplan.com:25500/sub");
    target.searchParams.set("target", "clash");
    target.searchParams.set(
      "url",
      "http://converter.judyplan.com:3001/T3B9dgzBzdRbF8Aqx7P/download/collection/aggressive"
    );
    target.searchParams.set("config", configMap[configName]);
    target.searchParams.set("scv", "true");
    target.searchParams.set("udp", "true");
    target.searchParams.set("new_name", "true");

    const response = await fetch(target.toString(), {
      method: "GET",
      headers: {
        "User-Agent": request.headers.get("User-Agent") || "",
      },
    });

    let text = await response.text();
    text = text.replace(/external-controller: .*/, "external-controller: 0.0.0.0:9090");

    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    newHeaders.set("Cache-Control", "no-store");
    newHeaders.set("Content-Type", "application/x-yaml; charset=utf-8");
    newHeaders.set("X-Sub-Config", configName.toUpperCase());
    newHeaders.set("X-Worker-Version", workerVersion);
    newHeaders.set(
      "Content-Disposition",
      "inline; filename*=UTF-8''%E8%81%9A%E5%90%88%E4%BC%98%E9%80%89CF%E7%89%88"
    );

    const userInfo = response.headers.get("subscription-userinfo");
    if (userInfo) {
      newHeaders.set("subscription-userinfo", userInfo);
    }

    return new Response(text, {
      status: response.status,
      headers: newHeaders,
    });
  },
};

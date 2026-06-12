const WORKER_VERSION = "2026-06-12-a1-a2-a3-display-name";
const CACHE_TTL_SECONDS = 3600;
const DISPLAY_NAMES = {
  a1: "聚合优选-兼容版",
  a2: "聚合优选-黑名单",
  a3: "聚合优选-白名单",
};

function normalizeConfig(text) {
  if (/^external-controller:.*$/m.test(text)) {
    return text.replace(
      /^external-controller:.*$/m,
      "external-controller: 0.0.0.0:9090"
    );
  }

  return `external-controller: 0.0.0.0:9090\n${text}`;
}

function isValidSubscription(text) {
  return (
    text &&
    text.length > 1000 &&
    /^proxies:\s*$/m.test(text) &&
    /^proxy-groups:\s*$/m.test(text) &&
    /^rules:\s*$/m.test(text)
  );
}

function displayNameFor(configName) {
  return DISPLAY_NAMES[configName] || `聚合优选-${configName.toUpperCase()}`;
}

function applyConfigHeaders(headers, configName, cacheStatus) {
  const displayName = displayNameFor(configName);
  headers.set("X-Sub-Config", configName.toUpperCase());
  headers.set("X-Sub-Name", displayName);
  headers.set("X-Worker-Version", WORKER_VERSION);
  headers.set("X-Sub-Cache", cacheStatus);
  headers.set(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(displayName)}`
  );
}

function buildHeaders(sourceHeaders, configName, cacheStatus) {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/x-yaml; charset=utf-8");
  applyConfigHeaders(headers, configName, cacheStatus);

  const userInfo = sourceHeaders?.get("subscription-userinfo");
  if (userInfo) {
    headers.set("subscription-userinfo", userInfo);
  }

  return headers;
}

function staleResponse(cached, configName) {
  const headers = new Headers(cached.headers);
  headers.set("Cache-Control", "no-store");
  applyConfigHeaders(headers, configName, "STALE");
  return new Response(cached.body, { status: 200, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/_version") {
      return Response.json({
        name: "clash-sub",
        version: WORKER_VERSION,
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
      a3: "https://raw.githubusercontent.com/ivanfuland/clash/refs/heads/main/Clash-A3.ini",
    };

    const rawConfig =
      url.searchParams.get("config") ||
      url.searchParams.get("profile") ||
      url.searchParams.get("rule") ||
      (url.searchParams.has("a1") ? "a1" : "") ||
      (url.searchParams.has("a2") ? "a2" : "") ||
      (url.searchParams.has("a3") ? "a3" : "") ||
      "a2";

    const configName = rawConfig
      .toLowerCase()
      .replace(/^clash-/, "")
      .replace(/\.ini$/, "");

    if (!configMap[configName]) {
      return new Response("Bad Request: config must be A1, A2 or A3", { status: 400 });
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

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}${url.pathname}?config=${configName}`);
    const cached = await cache.match(cacheKey);

    let response;
    try {
      response = await fetch(target.toString(), {
        method: "GET",
        headers: {
          "User-Agent": request.headers.get("User-Agent") || "",
        },
      });
    } catch (error) {
      if (cached) return staleResponse(cached, configName);
      return new Response(`Upstream fetch failed: ${error.message}`, { status: 502 });
    }

    const text = normalizeConfig(await response.text());

    if (!response.ok || !isValidSubscription(text)) {
      if (cached) return staleResponse(cached, configName);
      return new Response("Upstream returned invalid subscription", { status: 502 });
    }

    const headers = buildHeaders(response.headers, configName, "MISS");
    const cacheHeaders = new Headers(headers);
    cacheHeaders.set("Cache-Control", `public, max-age=${CACHE_TTL_SECONDS}`);
    cacheHeaders.set("X-Sub-Cache", "HIT");

    const cacheResponse = new Response(text, {
      status: 200,
      headers: cacheHeaders,
    });

    if (ctx?.waitUntil) {
      ctx.waitUntil(cache.put(cacheKey, cacheResponse.clone()));
    } else {
      await cache.put(cacheKey, cacheResponse.clone());
    }

    return new Response(text, { status: 200, headers });
  },
};

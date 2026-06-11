export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname !== "/sub.yaml") {
      return new Response("Not Found", { status: 404 });
    }

    if (url.searchParams.get("token") !== "jhyx") {
      return new Response("Unauthorized", { status: 401 });
    }

    const target =
      "http://converter.judyplan.com:25500/sub?target=clash&url=http%3A%2F%2Fconverter.judyplan.com%3A3001%2FT3B9dgzBzdRbF8Aqx7P%2Fdownload%2Fcollection%2Faggressive&config=https%3A%2F%2Fraw.githubusercontent.com%2Fivanfuland%2Fclash%2Frefs%2Fheads%2Fmain%2FClash-A2.ini&scv=true&udp=true&new_name=true";

    const targetUrl = new URL(target);
    targetUrl.searchParams.set("expand", "false");
    targetUrl.searchParams.set("classic", "true");

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}${url.pathname}`);

    const buildHeaders = (sourceHeaders) => {
      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Cache-Control", "no-store");
      headers.set("Content-Type", "application/x-yaml; charset=utf-8");
      headers.set(
        "Content-Disposition",
        "inline; filename*=UTF-8''%E8%81%9A%E5%90%88%E4%BC%98%E9%80%89CF%E7%89%88"
      );

      const userInfo = sourceHeaders?.get("subscription-userinfo");
      if (userInfo) {
        headers.set("subscription-userinfo", userInfo);
      }

      return headers;
    };

    const isValidYaml = (text) => {
      return (
        text &&
        text.length > 1024 &&
        /^proxies:\s*$/m.test(text) &&
        /^proxy-groups:\s*$/m.test(text) &&
        /^rules:\s*$/m.test(text)
      );
    };

    const normalizeYaml = (text) => {
      if (/^external-controller:.*$/m.test(text)) {
        return text.replace(
          /^external-controller:.*$/m,
          "external-controller: 0.0.0.0:9090"
        );
      }

      return `${text.trimEnd()}\nexternal-controller: 0.0.0.0:9090\n`;
    };

    const cached = await cache.match(cacheKey);

    try {
      const response = await fetch(targetUrl.toString(), {
        method: "GET",
        headers: {
          "User-Agent": request.headers.get("User-Agent") || "",
        },
      });

      let text = await response.text();
      text = normalizeYaml(text);

      if (!response.ok || !isValidYaml(text)) {
        if (cached) {
          const headers = buildHeaders(cached.headers);
          headers.set("X-Sub-Cache", "STALE");
          return new Response(cached.body, { status: 200, headers });
        }

        return new Response("Upstream returned invalid subscription", {
          status: 502,
        });
      }

      const headers = buildHeaders(response.headers);
      headers.set("X-Sub-Cache", "MISS");

      const cacheHeaders = new Headers(headers);
      cacheHeaders.set("Cache-Control", "public, max-age=3600");
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

      return new Response(text, {
        status: 200,
        headers,
      });
    } catch (error) {
      if (cached) {
        const headers = buildHeaders(cached.headers);
        headers.set("X-Sub-Cache", "STALE");
        return new Response(cached.body, { status: 200, headers });
      }

      return new Response(`Upstream fetch failed: ${error.message}`, {
        status: 502,
      });
    }
  },
};
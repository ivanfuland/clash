export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname !== "/sub.yaml") {
      return new Response("Not Found", { status: 404 });
    }

    if (url.searchParams.get("token") !== "jhyx") {
      return new Response("Unauthorized", { status: 401 });
    }

    const target = "http://converter.judyplan.com:25500/sub?target=clash&url=http%3A%2F%2Fconverter.judyplan.com%3A3001%2FT3B9dgzBzdRbF8Aqx7P%2Fdownload%2Fcollection%2Faggressive&config=https%3A%2F%2Fraw.githubusercontent.com%2Fivanfuland%2Fclash%2Frefs%2Fheads%2Fmain%2FClash-A2.ini&scv=true&udp=true&new_name=true";

    const response = await fetch(target, {
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
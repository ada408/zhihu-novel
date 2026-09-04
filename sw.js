/* 小说创作工作台 · Service Worker
   策略：全部网络优先 + 失败回落缓存。
   历史问题：曾用「外壳缓存优先」，导致更新 index.html 后用户端一直加载旧版（点刷新也没用），
   因此改为网络优先——联网时永远拿最新代码，仅离线时才用缓存兜底。
   注意：稿件正文存在 IndexedDB，不经过 SW，无需在此处理。 */
const CACHE = "novel-studio-v3";
const SHELL = ["./", "./index.html", "./sw.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // 素材数据：网络优先，失败回落缓存
  if (url.pathname.endsWith("/data.json")) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put("./data.json", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./data.json"))
    );
    return;
  }

  // 应用外壳：网络优先，失败才回落缓存（保证用户总能拿到最新版）
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

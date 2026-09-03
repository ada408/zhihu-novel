/* 小说创作工作台 · Service Worker
   策略：data.json 网络优先（素材更新能生效）+ 失败回落缓存；应用外壳缓存优先。
   注意：稿件正文存在 IndexedDB，不经过 SW，无需在此处理。 */
const CACHE = "novel-studio-v1";
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

  // 应用外壳：缓存优先，后台更新
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

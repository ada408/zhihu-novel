/**
 * 本地 CORS 转发（零门槛，仅同 WiFi / 局域网可用，适合先在电脑上验证 App 流程）
 *
 * 用法：
 *   set RELAY_SECRET=a1b2c3d4
 *   set SEN_NOVA_KEY=sk-你的日日新key   (可选)
 *   node local_relay.js
 * 默认监听 8787。手机和电脑连同一个 WiFi，App Base URL 填 http://电脑内网IP:8787/v1
 * 查电脑内网 IP：Windows 在 cmd 输 ipconfig 看「IPv4 地址」
 *
 * 注意：这是本地临时方案，电脑关机/换网络就失效，且手机需与电脑同网。
 *      长期稳定请部署 scf_relay.py（腾讯云函数）。
 */
const http = require("http");
const https = require("https");
const UPSTREAM = "https://token.sensenova.cn";
const PORT = process.env.PORT || 8787;
const RELAY_SECRET = process.env.RELAY_SECRET || "";
const SEN_NOVA_KEY = process.env.SEN_NOVA_KEY || "";

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Relay-Secret");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

  const relay = req.headers["x-relay-secret"];
  if (RELAY_SECRET && relay !== RELAY_SECRET) { res.statusCode = 403; res.end("forbidden"); return; }

  const target = UPSTREAM + req.url;
  const headers = Object.assign({}, req.headers);
  delete headers["host"]; delete headers["origin"]; delete headers["referer"];
  if (SEN_NOVA_KEY) headers["authorization"] = "Bearer " + SEN_NOVA_KEY;

  const chunks = [];
  req.on("data", c => chunks.push(c));
  req.on("end", () => {
    const r = https.request(target, { method: req.method, headers }, up => {
      res.statusCode = up.statusCode;
      up.pipe(res);
    });
    r.on("error", e => { res.statusCode = 502; res.end(JSON.stringify({ error: e.message })); });
    r.write(Buffer.concat(chunks)); r.end();
  });
});
server.listen(PORT, () => console.log("本地转发已启动 http://localhost:" + PORT + "  (RelaySecret=" + (RELAY_SECRET ? "已设" : "空") + ")"));

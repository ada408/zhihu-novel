# -*- coding: utf-8 -*-
"""
腾讯云函数 SCF 转发脚本（国内访问稳定，推荐）
为什么用它：workers.dev 在中国被墙，腾讯云函数域名 apigw.tencentcs.com 国内直连可用。

部署（3 分钟）：
1. 登录 https://console.cloud.tencent.com/scf ，新建函数 → 自定义创建
2. 运行环境选 Python 3.10，函数类型选「Web 函数」（不是事件函数）
3. 把本文件内容粘贴到入口文件（默认 index.py / main_handler）
4. 函数管理 → 函数配置 → 环境变量，添加：
   RELAY_SECRET = 随意一长串（如 a1b2c3d4）
   SEN_NOVA_KEY = 你的日日新 sk-...（可选，填了 App 端 Key 可留空）
5. 触发器管理 → 访问路径，得到公网 URL，形如
   https://xxx.apigw.tencentcs.com/release/ 或 https://xxx.apigw.tencentcs.com/prod/
6. 小说 App 设置 → Base URL 填该 URL（保留末尾 /，不写 /v1，因为网关已含路径）
   Relay Secret 填同一个 RELAY_SECRET；若设了 SEN_NOVA_KEY，App Key 留空。
7. 点测试连接。

安全：RELAY_SECRET 防止公网被当开放代理；SEN_NOVA_KEY 让密钥只在服务端，永不进浏览器。
"""
import json
import os
import urllib.request
import urllib.parse

UPSTREAM = "https://token.sensenova.cn"


def main_handler(event, context):
    method = (event.get("httpMethod") or "GET").upper()

    # 预检
    if method == "OPTIONS":
        return _cors(204, "")

    # 共享密钥校验
    secret = os.environ.get("RELAY_SECRET", "")
    headers_in = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    relay = headers_in.get("x-relay-secret", "")
    if secret and relay != secret:
        return _cors(403, "forbidden")

    # 目标地址
    path = event.get("path", "/")
    # 腾讯云网关默认带 /release 或 /prod 前缀，需剥掉再转发给上游
    prefix = os.environ.get("STRIP_PREFIX", "")
    for p in ([prefix] if prefix else ["/release", "/prod"]):
        if p and path.startswith(p):
            path = path[len(p):]
            break
    if not path.startswith("/"):
        path = "/" + path
    qs = event.get("queryString", {}) or {}
    target = UPSTREAM + path
    if qs:
        target += "?" + urllib.parse.urlencode(qs)

    # 转发头
    fwd = {}
    for k, v in (event.get("headers") or {}).items():
        if k.lower() in ("host", "connection", "content-length", "origin", "referer"):
            continue
        fwd[k] = v
    sen_key = os.environ.get("SEN_NOVA_KEY", "")
    if sen_key:
        fwd["Authorization"] = "Bearer " + sen_key

    body = event.get("body", "")
    if isinstance(body, str):
        body = body.encode("utf-8")

    req = urllib.request.Request(target, data=body if method != "GET" else None,
                                 method=method, headers=fwd)
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = resp.read()
        out = {
            "statusCode": resp.status,
            "headers": dict(resp.headers),
            "body": data.decode("utf-8", "ignore"),
        }
        return out
    except urllib.error.HTTPError as e:
        return _cors(e.code, e.read().decode("utf-8", "ignore"))
    except Exception as e:  # noqa
        return _cors(502, json.dumps({"error": str(e)}))


def _cors(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Relay-Secret",
            "Access-Control-Max-Age": "86400",
        },
        "body": body if isinstance(body, str) else json.dumps(body),
    }

# 小程序 EPUB 阅读 — 后端章节 API 规范（方案 B）

> **归属**：`dnhyxc-ai` 后端实现 | **消费者**：`dnhyxc-ebook-miniprogram`  
> **背景**：个人主体小程序不可用 `web-view`，阅读页通过 **预解析章节 HTML** + 小程序 `rich-text` 渲染。

---

## 1. 目标

- Web 端继续用 **epub.js + 原文件流**（`GET /ebook/file/:id`）
- 小程序端只消费 **已清洗的章节 HTML**，不在客户端解压 EPUB
- 上传 EPUB 时（或首次打开时）触发解析，结果持久化到 DB 或 COS

---

## 2. 新增/扩展接口

### 2.1 `GET /ebook/book/:id/chapters`

返回目录（spine + nav 合并后的线性列表）。

**Response 200**

```json
{
  "bookId": "uuid",
  "title": "书名",
  "total": 42,
  "chapters": [
    {
      "index": 0,
      "href": "OEBPS/chapter1.xhtml",
      "title": "第一章",
      "level": 0
    }
  ],
  "toc": [
    {
      "index": 0,
      "href": "OEBPS/chapter1.xhtml#section-2",
      "title": "第二节",
      "level": 1
    }
  ]
}
```

| 字段       | 说明                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| `chapters` | spine 线性章（阅读/进度）；`total` 与此长度一致                            |
| `toc`      | nav 展平目录（与 Web 一致）；可多条共用同一 `index`；缺省则 UI 用 chapters |
| `index`    | 0-based spine 下标，与 `GET .../chapter/:index` 一致                       |
| `href`     | EPUB 路径，toc 项可带 `#fragment`                                          |
| `level`    | 目录层级，0=章，1=节                                                       |

---

### 2.2 `GET /ebook/book/:id/chapter/:index`

返回单章正文（**rich-text 友好 HTML**）。

**Response 200**

```json
{
  "bookId": "uuid",
  "index": 0,
  "title": "第一章",
  "html": "<div><p>正文...</p></div>",
  "prevIndex": null,
  "nextIndex": 1,
  "total": 42
}
```

**HTML 清洗规则（服务端）**

1. 去掉 `<script>`、`<iframe>`、内联 `on*` 事件
2. 图片 `src` 重写为 **带签名的 HTTPS 绝对 URL**（或走 `GET /ebook/asset/:bookId?path=` 代理）
3. 仅保留 rich-text 支持的标签：`div p span h1-h6 img a br strong em` 等（按微信文档白名单）
4. 内链 `href` 统一加 `epub:` 前缀或返回 `internalHref` 字段供小程序跳转章节

**Errors**

| 状态 | 说明                                      |
| ---- | ----------------------------------------- |
| 404  | 书不存在或 index 越界                     |
| 409  | 章节尚未解析完成（`parseStatus=pending`） |
| 401  | 未登录                                    |

---

### 2.3 `PUT /ebook/progress`（扩展 body）

在现有 `bookId`、`epubCfi`、`percent` 基础上增加小程序字段：

```json
{
  "bookId": "uuid",
  "percent": 0.35,
  "epubCfi": "epubcfi(...)",
  "chapterIndex": 12,
  "chapterHref": "OEBPS/chapter13.xhtml",
  "scrollPercent": 0.42
}
```

| 字段                             | 写入方 | 说明                                                                |
| -------------------------------- | ------ | ------------------------------------------------------------------- |
| `epubCfi`                        | Web    | epub.js 定位                                                        |
| `chapterIndex` + `scrollPercent` | 小程序 | 章内滚动比例；`percent` 可由 `(index + scrollPercent) / total` 估算 |
| `percent`                        | 双方   | 全书进度 0–1，书架展示用                                            |

**恢复策略（小程序打开书）**

1. 若 `chapterIndex` 有值 → 打开对应章，`scroll-top = scrollPercent * 章高度`
2. 否则若 `percent` 有值 → `index = floor(percent * total)`
3. 否则从 0 开始

---

### 2.4 解析触发（内部）

| 时机                              | 行为                                                            |
| --------------------------------- | --------------------------------------------------------------- |
| `POST /ebook/upload` 成功         | 异步 job：解压 → 遍历 spine → 清洗 HTML → 写 `ebook_chapter` 表 |
| `GET .../chapter/:index` 且未解析 | 返回 409 + `{ parseStatus: 'pending' }`；可选同步等待（不推荐） |

**建议表结构**

```
ebook_chapter (
  id, book_id, chapter_index, href, title, level,
  html_storage_key, -- COS 路径或内联 text
  created_at
)
ebook_book.parse_status enum('pending','ready','failed')
```

---

## 3. 与现有 API 关系

| API                      | 变更                                                       |
| ------------------------ | ---------------------------------------------------------- |
| `GET /ebook/shelf`       | 无                                                         |
| `GET /ebook/book/:id`    | `prog` 增加 `chapterIndex`、`chapterHref`、`scrollPercent` |
| `GET /ebook/file/:id`    | 无（仅 Web）                                               |
| `PUT /ebook/progress`    | body 扩展                                                  |
| `GET .../chapters`       | **新增**                                                   |
| `GET .../chapter/:index` | **新增**                                                   |

---

## 4. 实现参考（NestJS）

- 解析库：`jszip` + `fast-xml-parser` 或 Node 侧复用 `epubjs` 的 `section.render()`（无 DOM）
- 图片：上传时拷贝到 `ebook-assets/{bookId}/` 前缀，章节 HTML 内写 CDN URL
- 鉴权：沿用 `JwtGuard`，`book.userId === sub`

---

## 5. 验收

| #   | 用例                                     | 期望                        |
| --- | ---------------------------------------- | --------------------------- |
| B1  | 上传 EPUB 后 30s 内 `parse_status=ready` | chapters 列表非空           |
| B2  | `GET chapter/0`                          | 返回合法 HTML，图片可加载   |
| B3  | 小程序 PUT progress 带 chapterIndex      | Web GET book 可见同 percent |
| B4  | 未解析完请求章节                         | 409 + pending               |

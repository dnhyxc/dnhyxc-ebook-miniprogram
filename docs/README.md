# dnhyxc-ebook-miniprogram 文档索引

## UI 主题、TabBar 与书架（本期）

| 文档                                                                     | 说明                                            |
| ------------------------------------------------------------------------ | ----------------------------------------------- |
| [ui-theme-tabbar-shelf-overview.md](./ui-theme-tabbar-shelf-overview.md) | **总览**：本期改动索引、文件地图、问题速查      |
| [theme-presets-and-chrome.md](./theme-presets-and-chrome.md)             | 十套主题 preset、窗口 Chrome、Header 与页面同色 |
| [vu-icons-integration.md](./vu-icons-integration.md)                     | vu-icons 接入、AppIcon、小程序编译约束          |
| [tabbar-layout-scroll-safe-area.md](./tabbar-layout-scroll-safe-area.md) | 滚动区域、底部白底、安全区、`with-tabbar`       |
| [tabbar-style-and-icon-colors.md](./tabbar-style-and-icon-colors.md)     | TabBar 边框阴影、图标/文字选中色                |
| [shelf-category-rail-theme.md](./shelf-category-rail-theme.md)           | 书架分类条配色实现与踩坑                        |
| [tabbar-and-theme.md](./tabbar-and-theme.md)                             | 早期 TabBar 文档（历史参考）                    |

## 产品与后端

| 文档                                                                   | 说明                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [epub-reader-implementation.md](./epub-reader-implementation.md)       | **EPUB 阅读实现说明**（方案 B：BullMQ 解析队列 + mp-html + 进度 + 重试） |
| [phase1-epub-shelf-reader-plan.md](./phase1-epub-shelf-reader-plan.md) | **第一期**：书架 + EPUB 阅读（**方案 B**：后端章节 API + rich-text）     |
| [backend-ebook-chapter-api.md](./backend-ebook-chapter-api.md)         | 后端章节解析与 API 规范（`dnhyxc-ai` 实现）                              |
| [epub-rendering-implementation.md](./epub-rendering-implementation.md) | 方案选型、mp-html 集成与里程碑（设计参考）                               |
| [wechat-local-setup.md](./wechat-local-setup.md)                       | 本地微信登录与 Web 账号关联                                              |

## 延伸阅读（主仓库 dnhyxc-ai）

- [docs/ebook/README.md](https://github.com/dnhyxc/dnhyxc-ai/blob/main/docs/ebook/README.md) — Web 端电子书专题索引
- [docs/ideas/wechat-miniprogram-epub-reader.md](https://github.com/dnhyxc/dnhyxc-ai/blob/main/docs/ideas/wechat-miniprogram-epub-reader.md) — 全功能小程序规划（听书/划线/想法等二期参考）
- [docs/ebook/miniprogram-epub-server-parse.md](https://github.com/dnhyxc/dnhyxc-ai/blob/main/docs/ebook/miniprogram-epub-server-parse.md) — 后端 BullMQ 解析队列归档（逐行注释）

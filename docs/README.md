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

| 文档                                                                                         | 说明                                                                                  |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [epub-reader-implementation.md](./epub-reader-implementation.md)                             | **EPUB 阅读实现说明**（方案 B：BullMQ 解析队列 + mp-html + 进度 + 重试）              |
| [reader-continuous-stream-impl.md](./reader-continuous-stream-impl.md)                       | **实现思路**：连续章节流、起始章恢复（percent 归一）                                  |
| [reader-chrome-toolbar-impl.md](./reader-chrome-toolbar-impl.md)                             | **实现思路**：微信读书式底栏、翻页设置、滚动收栏护栏                                  |
| [reader-toc-drawer-impl.md](./reader-toc-drawer-impl.md)                                     | **实现思路**：目录底部抽屉、手势关闭、关闭过渡动画                                    |
| [reader-theme-typography-impl.md](./reader-theme-typography-impl.md)                         | **实现思路**：换肤即时生效、两端对齐、HTML 清洗、字体滑轨                             |
| [reader-page-overscroll-navbar-impl.md](./reader-page-overscroll-navbar-impl.md)             | **实现思路**：回弹白底、状态栏/navbar 色、标题避让胶囊                                |
| [reader-mp-html-setdata-undefined-impl.md](./reader-mp-html-setdata-undefined-impl.md)       | **实现思路**：消除微信 `setData(undefined)` 警告（去掉 v-for 函数 ref）               |
| [reader-listen-guide.md](./reader-listen-guide.md)                                           | **功能详解与复刻**：听书整套（Edge TTS/BGM/音色/迷你条/跟读/高亮/锁屏续播与退出停播） |
| [reader-listen-hybrid-impl.md](./reader-listen-hybrid-impl.md)                               | **实现思路**：听书混合形态（Edge TTS、迷你条、独立听书页、倍速不改调）                |
| [reader-listen-follow-scroll-impl.md](./reader-listen-follow-scroll-impl.md)                 | **实现思路**：听书跟读滚屏（可视区保活）、回位、去「听」浮标、块段定位与 setData 性能 |
| [reader-listen-hidden-page-setdata-impl.md](./reader-listen-hidden-page-setdata-impl.md)     | **实现思路**：隐藏阅读页听书 `setInterval` 触发 `__subPageFrameEndTime__` 的防护      |
| [reader-listen-minibar-ui-impl.md](./reader-listen-minibar-ui-impl.md)                       | **实现思路**：迷你条图标对齐听书页、倍速左置、「听书页」入口文案                      |
| [reader-listen-highlight-impl.md](./reader-listen-highlight-impl.md)                         | **实现思路**：听书句级高亮（仅当前块段 setContent）                                   |
| [reader-ebook-toc-listen-impl.md](./reader-ebook-toc-listen-impl.md)                         | **实现思路**：目录 TOC 工具、节起点播句、听书分段优先于 tocSplit                      |
| [reader-listen-sentence-unit-impl.md](./reader-listen-sentence-unit-impl.md)                 | **实现思路（历史）**：曾「一句一单元」；现行见双轨合成文档                            |
| [reader-listen-dual-track-synth-impl.md](./reader-listen-dual-track-synth-impl.md)           | **实现思路**：紧急短句 + 长片段接龙、预取去掉已播句                                   |
| [reader-listen-tts-prefetch-impl.md](./reader-listen-tts-prefetch-impl.md)                   | **实现思路**：出声后再预取、每次只备 1 段、合成失败透出不抛穿                         |
| [reader-listen-skip-debounce-abort-impl.md](./reader-listen-skip-debounce-abort-impl.md)     | **实现思路**：上下句防抖合并、取消进行中 timed                                        |
| [reader-listen-toc-part-anchor-impl.md](./reader-listen-toc-part-anchor-impl.md)             | **实现思路**：目录锚点落到打包单元内句、切章滚屏按标题位                              |
| [reader-listen-inline-dash-highlight-impl.md](./reader-listen-inline-dash-highlight-impl.md) | **实现思路**：句中 `-----` 保留，修复高亮匹配                                         |
| [reader-listen-scroll-before-tts-impl.md](./reader-listen-scroll-before-tts-impl.md)         | **实现思路**：起播/目录切节先滚后合成、`playFrom` 不阻塞                              |
| [reader-listen-page-toc-chapter-nav-impl.md](./reader-listen-page-toc-chapter-nav-impl.md)   | **实现思路**：听书页上下章按目录邻项切换                                              |
| [reader-listen-page-script-display-impl.md](./reader-listen-page-script-display-impl.md)     | **实现思路**：听书页上片段下当前句、一卡钉底、两端对齐与字号                          |
| [reader-listen-play-waiting-loading-impl.md](./reader-listen-play-waiting-loading-impl.md)   | **实现思路**：等待出声 `onWaiting`→loading、播放钮转圈禁用                            |
| [reader-listen-rate-picker-impl.md](./reader-listen-rate-picker-impl.md)                     | **实现思路**：听书倍速刻度尺 UI、主题色、停稳提交、打开抽屉对齐当前倍速               |
| [reader-listen-rate-synth-cap-impl.md](./reader-listen-rate-synth-cap-impl.md)               | **实现思路**：timed speed≤2、>2x playbackRate 补速、防连打 400                        |
| [reader-html-word-break-impl.md](./reader-html-word-break-impl.md)                           | **实现思路**：正文强制断行，避免长串撑出横向滚动                                      |
| [reader-ui-chrome-toc.md](./reader-ui-chrome-toc.md)                                         | **问题笔记**（非正式）：阅读页 UI 迭代现象与代码摘录，正式文档见上列 `*-impl.md`      |
| [phase1-epub-shelf-reader-plan.md](./phase1-epub-shelf-reader-plan.md)                       | **第一期**：书架 + EPUB 阅读（**方案 B**：后端章节 API + rich-text）                  |
| [backend-ebook-chapter-api.md](./backend-ebook-chapter-api.md)                               | 后端章节解析与 API 规范（`dnhyxc-ai` 实现）                                           |
| [epub-rendering-implementation.md](./epub-rendering-implementation.md)                       | 方案选型、mp-html 集成与里程碑（设计参考）                                            |
| [wechat-local-setup.md](./wechat-local-setup.md)                                             | 本地微信登录与 Web 账号关联                                                           |

## 延伸阅读（主仓库 dnhyxc-ai）

- [docs/ebook/README.md](https://github.com/dnhyxc/dnhyxc-ai/blob/main/docs/ebook/README.md) — Web 端电子书专题索引
- [docs/ideas/wechat-miniprogram-epub-reader.md](https://github.com/dnhyxc/dnhyxc-ai/blob/main/docs/ideas/wechat-miniprogram-epub-reader.md) — 全功能小程序规划（听书/划线/想法等二期参考）
- [docs/ebook/miniprogram-epub-server-parse.md](https://github.com/dnhyxc/dnhyxc-ai/blob/main/docs/ebook/miniprogram-epub-server-parse.md) — 后端 BullMQ 解析队列归档（逐行注释）

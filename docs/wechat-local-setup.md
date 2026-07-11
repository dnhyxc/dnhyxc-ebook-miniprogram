# 微信小程序登录与账号关联（本地开发）

## 1. 环境划分

| 文件               | 用途                                                                        |
| ------------------ | --------------------------------------------------------------------------- |
| `.env.development` | `pnpm dev:mp-weixin` → `https://dnhyxc.cn:9112/api`                         |
| `.env.production`  | `pnpm build:mp-weixin` → `https://dnhyxc.cn:9112/api`（**固定，勿改端口**） |
| `.env`             | 可选本地回落 `http://localhost:9226/api`（仅本机 Nest 调试）                |

修改 env 后需 **重启** dev 进程。

## 2. 后端配置（dnhyxc-ai）

在 `apps/backend/.env.development` 增加：

```bash
WECHAT_MINIPROGRAM_APPID=你的小程序AppID
WECHAT_MINIPROGRAM_SECRET=你的小程序AppSecret
```

启动本地 Nest（默认 `9226`）：

```bash
cd apps/backend && pnpm start:dev
```

`DB_SYNC=true` 时会自动创建 `user_wechat` 表。

## 3. 微信开发者工具（本地）

- **详情 → 本地设置**：勾选「不校验合法域名…」（仅工具内生效）

## 4. 体验版 / 真机

线上 API **固定**为 `https://dnhyxc.cn:9112/api`（与 [Web 生产环境](https://dnhyxc.cn:9112) 一致）。

1. **合法域名**：request 须包含 `https://dnhyxc.cn:9112`（与 env 端口一致）
2. **构建上传**：`pnpm build:mp-weixin` → 上传 `dist/build/mp-weixin`（勿用 dev 目录）
3. **仍报 -102**：用手机浏览器访问 `https://dnhyxc.cn:9112/api`；若浏览器也失败，换 Wi‑Fi/4G 或联系运营商；合法域名里的 `:9226` 可删除（该端口无对外 HTTPS）

## 5. 账号关联流程

1. Web 登录 → **账号设置**（`/account`）→ **微信小程序** → 生成 6 位关联码
2. 小程序底部 Tab → **我的** → 点击 **微信登录**
3. 若该微信尚未关联 Web 账号，同页自动展开 **绑定 Web 账号** 表单
4. 输入关联码（或 Web 用户名/邮箱 + **用户名登录密码**）→ **确认绑定**

> 账号密码绑定校验 Web「用户名登录」密码。小程序须与 Web 一样先做 **AES 加密** 再提交（`VITE_MD5_KEY` / `VITE_MD5_IV_KEY` 与 `apps/frontend/.env` 一致）。拿不准密码时优先用关联码。

### 本地能绑、体验版报「密码错误」

体验版 toast 出现该文案说明 **已连上 9112**，不是网络 -102。常见原因：

1. **本地曾连 `localhost:9226`**（`.env` 回落）→ 校验的是本机 MySQL（3090），与线上生产库不是同一套密码。
2. **Web 平时用邮箱验证码登录**，「用户名登录」密码很久没用过或已改过。
3. **体验版包过旧**：须 `pnpm build:mp-weixin` 后重新上传；vConsole 网络里确认请求 host 为 `dnhyxc.cn:9112`。

**立刻可用**：Web 账号设置生成关联码 → 体验版选「关联码」绑定。

**要用账号密码**：在 Web 用「用户名 + 密码」（非邮箱验证码）能登录后，再在体验版绑定；或在 Web 重置密码后再试。

5. 回到 **书架** Tab，数据与 Web 同步

> 绑定表单只在「微信登录」返回 `need_bind` 后出现；已关联过的微信会直接登录成功。

## 6. API

| 接口                          | 说明                                     |
| ----------------------------- | ---------------------------------------- |
| `POST /auth/wechat/login`     | 小程序 code 登录；未绑定返回 `need_bind` |
| `POST /auth/wechat/bind`      | `bind_token` + 关联码或账号密码          |
| `POST /auth/wechat/link-code` | Web 已登录，生成关联码                   |
| `GET /auth/wechat/status`     | Web 查询是否已关联                       |
| `POST /auth/wechat/unbind`    | Web 解除关联                             |

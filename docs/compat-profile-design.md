# 兼容档案（compat profile）设计草案

状态：**草案，未实现**。执行顺序以 [实施方案](./controller-implementation-plan.md)
为准，先完成稳定性批次和统一 payload 装配。第一版只分发 selector，不含远端 CSS。
背景问题见 `tools/selectors.json` 的 `verifiedAgainst.gaps` 与 issue #277。

## 为什么需要它

近两个月的失效时间线：

| Codex 版本 | 破坏点 | 修复方式 |
| --- | --- | --- |
| 26.715.9757 → 26.715.10079 | owl runtime 把 `--remote-debugging-port` URL 编码进 `codex://` path，CDP 完全打不开 | #235，启动器加直连回退 |
| 26.721.x | 首页 `home-icon` 渐进渲染，被判成注入校验失败 | #306，改用 `[role="main"]` 容器 |
| 26.727.40816 | 主表面 / 顶栏语义类改成 CSS Modules | 合同追加 `data-app-shell-*` 与 `_MainContentSurface_` 前缀 |
| 26.803 | Owl composer 换成 `_ComposerLayoutBody_` / `_ComposerLayoutFooter_` | #359，追加前缀别名 |
| 26.814 | 输入框壳迁到 `_ComposerLayoutRoot_`，旧别名误绑到内层 footer | #372 / #373，v1.5.15 + v1.5.16 |
| 26.818 | composer 底部白框、链接与 Mention 分色、消息透明度 | #377 / #378，v1.5.16 |

两周内被迫连发 v1.5.13 / 14 / 15 / 16。每一次修的都只是**几个字符串**，但交付粒度是**整个安装包**：
用户必须重新下载 DMG / Setup.exe，而在这之前他们的皮肤是坏的。#373 里有用户等不及，
自己打包 `CodexDreamSkin-Setup-v1.5.15.zip` 传到 issue 里让别人下载——这既是安全事故风险，
也是"发版粒度不对"最直白的证据。

结构性结论：**选择器契约的变更频率由上游决定，不该由我们的发版节奏决定。**
现有 injector 在运行时读取 `assets/selectors.json`，但生成的 CSS 和 renderer
也各自编入了 selector。实施前必须统一装配，使 CSS、renderer 与 Verify 使用
同一份有效合同；仅增加 JSON 下载来源不足以完成热更新。

## 契约

### 接口

```
GET https://api.dreamskin.cc/v1/compat/profile
    ?platform=macos|windows
    &client=<客户端语义版本>
    &codex=<探测到的 Codex 版本，可缺省>
```

响应（`application/json`，无重定向，走现有 `BoundedCommunityHTTPClient` 的有界读取）：

```jsonc
{
  "schema": "dreamskin-compat-profile/1",
  "revision": 7,                       // 单调递增；客户端只接受 > 本地已缓存值
  "issuedAt": "2026-08-27T00:00:00Z",
  "expiresAt": "2026-09-26T00:00:00Z", // 过期即整份作废，回落到内置合同
  "minClient": "1.5.16",               // 低于此版本的客户端必须忽略本档案
  "selectors": [ /* 与 tools/selectors.json 的 selectors[] 同构 */ ],
  "signature": "ed25519:…"             // 对上面全部字段规范化后的签名
}
```

### 客户端合并规则

1. **启动时异步拉取，永不阻塞换肤。** 拿不到、超时、解析失败 → 用内置合同，静默继续。
2. **fail-closed 校验顺序**：HTTPS 固定 origin → 有界读取 → 签名 → `schema` → `revision`
   单调 → `expiresAt` 未过期 → `minClient` 满足 → 每条 selector 的 `key` 在内置合同里存在。
   任何一步不过，整份丢弃，不做部分应用。
3. **只允许覆盖 `selector` 字符串**，不允许新增 key，或改变 `tier`、`scope`、`required`。
   selector 也可能错误命中业务节点，因此签名不能代替兼容性验收。发布档案前用
   对应版本的脱敏 DOM fixture 验证作用域、命中数量、可见性与业务节点未被污染；
   客户端继续执行原有 readiness 和精确主题/payload 验证，不降低成功条件。
4. **第一版不接受 `css` 字段**。样式来自可信本地模板，以有效 selector 装配。
   CSS、renderer、Verify 必须报告同一 revision；校验或装配失败时三者一起回退。
   不在一个操作执行途中切换合同，下一次安全装配边界才激活新 revision。
5. **绝不接受脚本、URL、文件路径、命令。** 这是硬边界：档案是数据，不是代码。
   服务端也不得把用户可控内容拼进档案。

### 服务端

- 档案由维护者手工发布，进 git，走和迁移一样的部署流程；**不接受任何自动生成或用户投稿**。
- 私钥不在仓库、不在 VPS 的 web 进程里；签名在本地完成，服务端只分发已签名的静态 JSON。
- 边缘可缓存（与 `/v1/themes/*/preview/thumbnail` 同策略），但 `revision` 变更必须能在
  分钟级生效，缓存 TTL ≤ 5 分钟。

## 与现有机制的关系

- `tools/selectors.json` 仍是**唯一可编辑源**，档案由它导出，不新增第二处手写选择器。
- `tools/check-selector-provenance.mjs` 已经强制：改选择器就必须同步 `verifiedAgainst`。
  导出档案时应带上同一份 provenance，让 doctor 能报告"当前生效的合同来自哪里、验到哪个版本"。
- 档案不替代发版。启动器 / CDP / PowerShell / Swift 层面的问题（#235、#363、#378 第 1~3 节）
  仍然只能靠发版修——档案覆盖的只有 DOM 漂移这一类，而这一类恰好是最频繁的。

## 未决问题

1. 签名密钥的轮换与吊销策略（至少要能在客户端内置多个可信公钥）。
2. Doctor / 状态面板如何展示"正在使用远端档案 rev N"，让用户报 issue 时能说清。
3. 是否需要用户可关闭的开关（默认开、可关，还是默认关）。倾向默认开 + 可关，
   因为默认关等于没做。
4. 档案与 `runtime/dom-fixtures/*` 的关系：远端换了选择器之后，本地 fixture 会立刻失真，
   需要一条"档案里的选择器必须在至少一份 fixture 上有命中记录或显式标注为未覆盖"的规则。

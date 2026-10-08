# Issues #427–#429：Windows PR 验收

本 PR 同时修复 Windows 自定义 `CODEX_HOME`（#428）、双平台首页副文案字号/颜色（#427）和 macOS 进程身份的语言环境问题（#429）。Windows 验收重点是前两项；#429 的 macOS 验证结果见 PR 正文。

这不是新 Release。版本仍为 `1.5.19`，必须按 **PR head commit** 区分测试包，不能仅凭安装器文件名判断包含修复。测试完成前不关闭对应 issue。

## 1. 取得代码和对应安装包

在新的工作目录 clone 仓库后，从本 PR 页面复制编号，以 `<PR>` 替换以下占位符：

```text
git clone https://github.com/Fei-Away/Codex-Dream-Skin.git
cd Codex-Dream-Skin
gh pr checkout <PR>
git rev-parse HEAD
git status --short
```

记录完整 commit、Windows 版本、官方 Codex 版本，以及测试使用的 PowerShell 版本。

优先下载该 PR **相同 head commit** 的成功 CI run 中 `CodexDreamSkin-setup` artifact，解压得到 Setup.exe。不要使用旧 Release 的 v1.5.19 安装包代替。首次测试或切换配置目录前，退出 Dream Skin 托盘并关闭官方 Codex；保留原始 config 和 Dream Skin 状态备份，推荐独立 Windows 测试账户。

## 2. 自动化回归

仓库根目录运行（Node.js 22+；不需要真实账号或启动 Codex）：

```powershell
node tools/sync-runtime-assets.mjs --check
node --test macos/tests/*.test.mjs windows/tests/*.test.mjs tools/*.test.mjs
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File .\windows\tests\codex-home.tests.ps1
pwsh.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File .\windows\tests\codex-home.tests.ps1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File .\windows\tests\run-tests.ps1
pwsh.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File .\windows\tests\run-tests.ps1
```

两个 PowerShell 版本都应成功。新 fixture 在临时目录验证空格/中文路径、备份归属、恢复、旧备份、无效路径和 junction 拒绝；不会迁移真实用户目录。全套测试还覆盖已有主题、启动失败回滚及安装器相关行为。

## 3. #428：自定义 Codex Home 完整流程

先让官方 Codex 本身在测试目录中正常启动并生成 `config.toml`，例如 `D:\DreamSkin QA\测试\.codexHome`。不要把 API Key、登录凭据或真实 `config.toml` 放进 PR、截图或日志附件。

Dream Skin 跟随**进程环境中的 `CODEX_HOME`**；未设置或空值才使用 `%USERPROFILE%\.codex`。仅移动目录而没有设置变量，并不能告诉程序配置在哪。路径必须是本地磁盘的完整目录，不能是 config 文件、相对路径、UNC 或 junction。

如果用 PowerShell 启动测试安装器，先在同一个窗口设置：

```powershell
$env:CODEX_HOME = 'D:\DreamSkin QA\测试\.codexHome'
& 'C:\路径\CodexDreamSkin-Setup-v1.5.19.exe'
```

从 Explorer、开始菜单和桌面快捷方式验收时，需让该测试账户的用户级 `CODEX_HOME` 生效，退出旧托盘并注销/重新登录后再运行；只设置某个终端的 `$env:CODEX_HOME` 不会更新已经运行的 Explorer/托盘。测试后恢复原有环境变量设置。

| 步骤 | 通过标准 |
| --- | --- |
| 自定义目录安装 | 不再报默认 `.codex/config.toml` 不存在；备份来自指定目录；默认目录没有被创建或改写 |
| 快捷方式启动与应用主题 | 使用相同 `CODEX_HOME`；皮肤正常显示，Verify 通过；不要求复制配置回 C 盘 |
| 应用固定深/浅色主题 | 外观设置只作用于自定义配置；模型、provider、MCP 等无关配置保持原值 |
| 退出并重新启动 Dream Skin/Codex | 仍使用自定义目录，主题可正常重新应用 |
| Restore 官方外观 | 还原自定义目录的原外观值，保留之后添加的无关配置；默认目录不变 |
| 覆盖安装同一 PR 包 | 已保存主题、图片、配置备份继续有效；没有重新绑定到默认目录 |
| 卸载 | 恢复自定义目录后卸载成功；用户主题/图片按现有产品约定保留 |

另外用未设置 `CODEX_HOME` 的独立测试账户跑一次默认目录的安装→应用→恢复，确认旧用法仍正常。

## 4. #428：错误路径和备份保护

每项操作前保留原配置副本，确认失败后文件未变化。不要删除 origin、备份、事务文件来绕过拒绝。

- 配置 `CODEX_HOME` 为不存在的目录、存在但缺少 config 的目录、相对路径、盘符相对路径（`D:relative`）、空白字符串、config 文件路径或 junction：应明确拒绝，不能偷偷使用默认目录。
- 在目录 A 安装并保留活动配置备份后，把环境变量改为目录 B：安装/启动/恢复应拒绝备份归属不一致；A、B 两边都不能被错误恢复。
- 改回 A 完成 Restore，确认旧备份已归档后，再迁移/配置 B：应允许新的绑定和备份。
- 从旧版升级，已有不带 `.origin.json` 的备份：默认 home 的恢复保持可用；切换到自定义 home 时应要求先恢复原默认 home，不把旧备份套到新目录。
- `-RecoverConfigBackup` 恢复缺失 config 的路径由自动化 fixture 覆盖；人工灾难恢复仅在独立测试账户执行，确认目标仍是原绑定 home。

本 PR 不放宽 #344 的 profile junction/reparse 限制。

## 5. #427：首页副文案

使用一个可信完整主题副本（独立 ID，包含背景图、theme.json、theme.css），在其 `theme.css` 中加入：

```css
[data-ds-part="home-hero"] {
  font-size: 18px;
  color: #f5e7d0;
}
```

导入到已保存主题库后手动应用，在实际显示副文案的首页布局检查：

1. 副文案字号为 18px，颜色跟随 `home-hero`，保留 76% 不透明度。标题同样受这个部件设置影响。
2. 分别改为 12px、20px，重新应用后准确生效；窄窗口也不被默认 11px 规则盖回去。
3. 移除字号设置后回到原默认大小；移除颜色设置后回到主题默认颜色。
4. 在桌面宽度与较窄窗口检查换行、侧栏、输入框和项目控件，不能溢出或遮挡点击。
5. 切换其他主题、重新应用和 Restore 后没有残留样式。
6. Safe CSS 仍拒绝作者直接写 `::after`、自定义属性，以及 12–20px 范围外的字号。不要为了测试打开验证旁路。

如某官方版本/模式不显示首页副文案，请记录版本和模式，切换到显示该布局的主页验证；不能将“没有副文案可测”记为通过。

## 6. 回传验收记录

在 PR 留下：完整 head commit、CI run 链接和 artifact 名称、Windows/Codex/PowerShell 版本、上述各项通过/失败、脱敏错误信息及必要截图。明确区分源代码测试、Setup 安装测试和真实窗口验证。任何阻塞都保留原文件与日志供定位，不把失败记作跳过后通过。

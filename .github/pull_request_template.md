<!--
Thanks for contributing! Please complete this template.
感谢贡献！请填完本模板后再提交。

Docs: README.md · macos/README.md · windows/SKILL.md · docs/platforms.md
Security: loopback CDP only — do not patch official .app / asar / WindowsApps; do not rewrite API keys.
安全：仅本机 CDP；勿改官方安装包；勿静默改写 API。
-->

## Summary / 摘要

<!-- What changed and why? 1–5 bullets. 改了什么、为什么？ -->

-

## Type / 类型

- [ ] Bug fix / 缺陷修复
- [ ] Feature / 新功能
- [ ] Docs / 文档
- [ ] Theme / CSS / visual / 主题或视觉
- [ ] Scripts / install / restore / 脚本或安装恢复
- [ ] Chore / 杂项

## Platform / 平台

- [ ] macOS
- [ ] Windows
- [ ] Both / 双平台
- [ ] Docs / repo only / 仅文档或仓库元数据

## Self-check / 自测

Check what you actually ran. Skip items that do not apply and say so under Notes.
请勾选**实际跑过**的项；不适用的在 Notes 说明。

### Docs-only / 仅文档

- [ ] Links and wording reviewed / 已检查链接与表述

### macOS (when code under `macos/` changes)

- [ ] `macos/tests/run-tests.sh` passed / 已通过
- [ ] Doctor (optional): `macos/scripts/doctor-macos.sh`
- [ ] Live verify (if inject/CSS/start path): `verify-dream-skin-macos.sh` or Desktop **Verify**
- [ ] Restore / re-apply smoke (if install/restore/start changed) / 若改了安装恢复启动则做过恢复再应用

### Windows (when code under `windows/` changes)

- [ ] Relevant `install` / `start` / `verify` / `restore` scripts exercised / 已按改动跑过对应脚本
- [ ] Environment noted below (OS build, Codex source) / 下方注明环境

### User-facing / 用户可见变更

- [ ] Updated `macos/CHANGELOG.md` (and `macos/VERSION` if release-worthy) / 已更新 changelog（发版时再 bump VERSION）
- [ ] N/A — no user-facing change / 无用户可见变更

## Security / 安全

- [ ] Does **not** modify official Codex install / asar / signatures / 未修改官方安装与签名
- [ ] Does **not** silently write API Base URL or keys / 未静默写入 API Base URL 或 Key
- [ ] CDP remains loopback-oriented (`127.0.0.1`) where applicable / CDP 仍仅本机回环（如适用）

## Notes / 补充

<!-- Test output summary, screenshots (no private chat), follow-ups. 测试摘要、截图（勿含隐私对话）、后续事项。 -->

-

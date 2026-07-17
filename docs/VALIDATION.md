# `.dreamskin` 导入验证矩阵

本文记录外部主题包功能的机械验收入口。所有状态测试使用临时目录，不读取或修改用户真实主题库。

| 能力 | 自动化证据 | 通过条件 |
| --- | --- | --- |
| 作者契约 | `node --test tests/theme-package-*.test.mjs` | Schema、运行时 validator、示例和确定性 golden 包一致 |
| 不可信 ZIP | `theme-package-cli`、`theme-package-zip`、`theme-package-zip-file` | 拒绝穿越、重复、加密、链接、CRC/哈希错误、未知条目与尺寸超限；Store/Deflate 均受控 |
| 流式导入 | `node --test tests/theme-import-core.test.mjs` | 32 MiB 包不整包读入；资源以不超过 64 KiB 的块写入系统命名暂存文件 |
| 平台编译 | `theme-import-core` + 两端 injector `--check-payload` | 同一 golden 包产生相同身份，并通过 macOS/Windows 运行时主题校验 |
| 原子事务 | `theme-import-core` 故障注入 | 新装完整发布；重复导入幂等；默认冲突不变；显式替换失败恢复旧主题 |
| 活动主题隔离 | `theme-import-core` | install 只写 `themes/<packageId>`，活动 `theme/` 字节不变 |
| macOS 入口 | `macos/tests/run-tests.sh` | dry-run、安装、点号包 ID 选择通过；菜单、standalone ZIP 与客户 ZIP 自包含 importer |
| Windows 入口 | `windows/tests/run-tests.ps1` | PowerShell 5.1 与 7 原生运行 dry-run、安装、幂等选择、runtime 自包含、托盘入口；共享故障注入在 Windows runner 同时执行 |

本机 macOS 完整门禁：

```bash
node --test tests/*.test.mjs
macos/tests/run-tests.sh
```

Windows 门禁必须由原生 Windows runner 同时执行 PowerShell 5.1 和 PowerShell 7；在 macOS 上仅做语法或文本检查不能替代该证据。CI 工作流是合并前的最终 Windows 事实源。

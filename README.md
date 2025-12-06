# ScribbleFlow

一个基于 Electron + Vue 3 的知识管理与思维导图应用，帮助你整理想法、构建知识网络。

## ✨ 特性

- 🧠 **知识卡片系统** - 创建和连接知识卡片，构建你的知识网络
- 💬 **AI 对话助手** - 集成多个 LLM 提供商，支持智能对话和摘要生成
- 🎨 **可视化画布** - 基于 Vue Flow 的交互式画布，直观展示知识关系
- 💾 **本地数据存储** - 使用 SQLite 本地数据库，数据安全可控
- 🔄 **版本历史** - 支持撤销/重做操作，放心编辑
- 📦 **跨平台** - 支持 Windows、macOS 和 Linux

## 🚀 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建应用

```bash
npm run build
```

## 📁 项目结构

```
ScribbleFlow/
├── src/                    # 前端源码
│   ├── components/         # Vue 组件
│   ├── views/             # 页面视图
│   ├── stores/            # Pinia 状态管理
│   ├── api/               # API 接口
│   └── types/             # TypeScript 类型定义
├── electron/              # Electron 主进程代码
├── database/              # 数据库相关
├── docs/                  # 文档
└── dist/                  # 构建输出
```

## 🎯 核心功能

### 知识管理

- 创建知识库和知识卡片
- 卡片间建立连接关系
- 支持卡片状态管理（待办、进行中、已完成、已归档）
- AI 辅助生成知识结构

### AI 对话

- 支持多个 LLM 提供商（OpenAI、Claude、本地模型等）
- 智能摘要生成
- 上下文管理（摘要、全部对话、选中对话）
- 对话历史记录

### 画布交互

- 拖拽创建和移动卡片
- 右键菜单快捷操作
- 键盘快捷键支持
- 撤销/重做功能

## ⌨️ 快捷键

- `Cmd/Ctrl + Z` - 撤销
- `Cmd/Ctrl + Shift + Z` - 重做
- `Cmd/Ctrl + C` - 复制选中卡片
- `Cmd/Ctrl + V` - 粘贴卡片
- `Cmd/Ctrl + A` - 全选
- `Delete/Backspace` - 删除选中卡片
- `双击画布` - 创建新卡片
- `双击卡片标题` - 编辑标题
- `双击卡片内容` - 编辑摘要

## 🛠️ 技术栈

- **前端框架**: Vue 3 + TypeScript
- **状态管理**: Pinia
- **UI 框架**: Tailwind CSS
- **画布组件**: Vue Flow
- **桌面框架**: Electron
- **数据库**: SQLite (better-sqlite3)
- **构建工具**: Vite
- **打包工具**: electron-builder

## 📦 打包发布

### macOS

```bash
npm run build -- --mac
```

### Windows

```bash
npm run build -- --win
```

### Linux

```bash
npm run build -- --linux
```

打包后的文件会生成在 `release/` 目录中。

## 🔧 配置

### LLM 配置

在设置页面配置你的 LLM API：

1. 选择模型提供商
2. 输入 API Key
3. 配置 API 地址（如需要）
4. 调整生成参数（Temperature、Max Tokens 等）

### 数据备份

应用支持数据导出和导入：

- 导出：将数据库保存为文件
- 导入：从文件恢复数据库（会自动备份当前数据）

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🆘 支持

如果你遇到问题或有建议，请：

1. 查看 [已知问题](docs/known-issues.md)
2. 提交 [Issue](https://github.com/your-username/ScribbleFlow/issues)
3. 参与 [讨论](https://github.com/your-username/ScribbleFlow/discussions)
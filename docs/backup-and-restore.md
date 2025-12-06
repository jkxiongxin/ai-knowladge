# 备份与恢复（导出/导入）

为了避免在应用升级或迁移时丢失知识库数据，ScribbleFlow 现在支持下列功能：

- 导出单个知识库（JSON）：在“我的知识库”页的每个知识库卡片右上角点击导出按钮（⤓），会将知识库内容（卡片、连接、消息和摘要）导出为一个 JSON 文件。
- 导入单个知识库（JSON）：在“我的知识库”页顶部点击“导入”按钮（⬆️），选择之前导出的 JSON 文件即可导入。导入时如果遇到 ID 冲突，会为导入项生成新的 ID（你也可以在导入前选择覆盖已有工作区）。
- 导出完整数据库（SQLite）：在“设置 → 模型设置”页，找到“备份 & 恢复”卡片，并点击“导出数据库”即可将当前本地 SQLite 文件复制到你选择的位置，作为完整备份。
- 从文件导入数据库（SQLite 替换）：同样在“备份 & 恢复”中使用“从文件导入数据库”按钮选择一个 .db/.sqlite 文件，应用会尝试先备份当前数据库（生成 .bak 文件），再替换为所选文件，并重载 DB。

注意事项：

- 导入单个知识库不会覆盖其他工作区，除非你在导入时选择覆盖（overwrite）。
- 导入操作会尽量保留 ID，但若发生冲突会自动生成新的 ID 并修正内部引用关系，以避免意外覆盖数据。
- 导入 SQLite 文件会替换整个数据库；在执行导入数据库前请确保你有当前项目的备份。

开发者说明：

- 导出/导入的实现位于 electron/db.ts（exportWorkspace / importWorkspaceData），并通过 electron/main.ts 暴露 IPC 通道供渲染层调用。
- 渲染层 API 在 src/api/index.ts 添加了 electronApi.exportWorkspace / importWorkspace / exportDatabase / importDatabase。UI 入口分别在 `src/views/WorkspaceListView.vue`（按工作区导出/导入）和 `src/views/SettingsView.vue`（完整数据库备份/恢复）。

如果需要扩展：支持更丰富的导入策略（合并、差异合并、选择性导入）或自动定时备份是下一步的良好方向。

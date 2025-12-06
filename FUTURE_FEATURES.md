# ScribbleFlow - Future Roadmap & Missing Features

This document outlines the features required to evolve ScribbleFlow from a functional MVP to a mature, production-ready application.

## 1. Configuration & Settings ⚙️
- [ ] **LLM Provider Management**: UI to switch between Ollama, OpenAI, Anthropic, etc.
- [ ] **Model Selection**: Dropdown to select specific models (e.g., `llama3`, `gpt-4`) per card or globally.
- [ ] **API Key Management**: Secure storage for API keys (using Electron's `safeStorage`).
- [ ] **System Prompts**: User-customizable global system prompts.
- [ ] **Theme Customization**: Toggle between Light/Dark modes and custom accent colors.

## 2. Chat Experience 💬
- [x] **Streaming Responses**: Implement Server-Sent Events (SSE) or IPC streaming to show AI responses character-by-character (Typewriter effect).
- [x] **Markdown Rendering**: Render bold, italics, lists, and code blocks in chat bubbles (using `markdown-it` or similar).
- [ ] **Code Syntax Highlighting**: Highlight code blocks in AI responses.
- [x] **Branching & Editing**:
    - [x] UI to edit user messages and regenerate responses.
    - [x] UI to edit AI responses and update context.
    - [ ] UI to navigate between different message branches (Previous/Next version).
- [ ] **Slash Commands**: `/clear`, `/summarize`, `/expand` commands in the chat input.
- [x] **Card References**: Ability to reference other cards' summaries in the chat (via Card Picker UI).
- [x] **Undo/Redo**: History tracking for message edits with undo/redo support.

## 2.5 Keyboard Shortcuts ⌨️
- [x] **Shortcuts System**: Global keyboard shortcut management.
- [x] **Available Shortcuts**:
    - `⌘/Ctrl + /` - Show shortcuts help panel
    - `⌘/Ctrl + Z` - Undo message edit
    - `⌘/Ctrl + ⇧ + Z` - Redo message edit
    - `⌘/Ctrl + N` - Create new card
    - `Escape` - Close chat window

## 3. Canvas & Interaction 🎨
- [ ] **Auto-Layout**: "Tidy Up" button to automatically arrange nodes using a force-directed or tree layout algorithm (e.g., `dagre` or `elkjs`).
- [ ] **Mini-Map**: A navigational mini-map in the corner of the canvas.
- [ ] **Zoom Controls**: UI buttons for Zoom In/Out/Fit to Screen.
- [ ] **Multi-Selection Actions**: Bulk delete, bulk move, or bulk color change.
- [ ] **Groups/Frames**: Ability to group multiple cards visually.
- [ ] **Connection Types**: Different line styles for different relationship types (e.g., "Supports", "Contradicts", "Relates to").

## 4. Data Management & Search 💾
- [ ] **Global Search UI**: A command palette (`Cmd+K`) to search across all cards and chat history using the FTS5 index.
- [ ] **Workspace Management**: UI to create, switch, rename, and delete workspaces (Universes).
- [ ] **Export/Import**:
    - [x] Export workspace to JSON/Markdown. (Implemented — Workspace list export + import)
    - [ ] Export chat history to a text file.
- [x] **Backup & Restore**: Automated backups of the SQLite database. (Manual export/import is implemented in Settings)
- [ ] **Database Migrations**: A robust migration system (e.g., `db-migrate` or custom) to handle schema changes over time.

## 5. Multimedia & Attachments 📎
- [ ] **Image Support**: Drag and drop images onto the canvas or into chat.
- [ ] **File Attachments**: Attach PDFs or text files to cards for the AI to read (RAG - Retrieval Augmented Generation).

## 6. Performance & Engineering 🛠️
- [ ] **Virtualization**: Optimize rendering for workspaces with 1000+ nodes.
- [ ] **Error Handling**: Graceful error messages when LLM is offline or API fails.
- [ ] **Auto-Updater**: Integration with `electron-updater` for seamless app updates.
- [ ] **Security**:
    - [ ] Context Isolation (enable `contextIsolation: true` and fully bridge all IPC).
    - [ ] Content Security Policy (CSP) headers.

## 7. Accessibility & Localization 🌍
- [ ] **Keyboard Navigation**: Full keyboard support for navigating the canvas and chat.
- [ ] **Screen Reader Support**: ARIA labels for canvas elements.
- [ ] **I18n**: Support for multiple interface languages.

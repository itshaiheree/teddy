# ⚡ umigent — Coding Agent CLI

**Zero-dependency** coding agent. Supports **Anthropic** & **OpenAI-compatible** APIs (OpenAI, Groq, OpenRouter, Ollama, DeepSeek, etc.).

## 🚀 Quick Install

### npm (global)
```bash
npm install -g umigent
```

### curl (Linux/macOS)
```bash
curl -fsSL https://raw.githubusercontent.com/username/umigent/main/install.sh | bash
```

### PowerShell (Windows)
```powershell
irm https://raw.githubusercontent.com/username/umigent/main/install.ps1 | iex
```

## ⚙️ Configuration

Create `.env` in your project directory or set environment variables:

```env
# Provider: "anthropic" or "openai"
PROVIDER=openai

# OpenAI-compatible (OpenAI, Groq, DeepSeek, Ollama, OpenRouter, etc.)
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-...
MODEL=gpt-4o

# Or Anthropic
# PROVIDER=anthropic
# ANTHROPIC_API_KEY=sk-ant-...
# MODEL=claude-sonnet-4-6
```

## 🎮 Usage

### Interactive mode (REPL)
```bash
umigent
```

### One-shot mode
```bash
umigent "Buat file hello.js lalu jalankan"
```

## ⌨️ Commands

| Command | Description |
|---------|-------------|
| `:help` / `CTRL+H` | Show help |
| `:exit` / `:quit`  / `CTRL+E` | Exit (auto-saves session) |
| `:clear` / `CTRL+L` | Reset current conversation |
| `:new` / `CTRL+N` | Save current session & start new |
| `:sessions` / `CTRL+O` | Open session picker |

## 💾 Sessions

- All sessions are saved automatically to `~/.umigent/sessions/`
- Press **CTRL+O** or type `:sessions` to browse, load, or delete sessions
- Arrow keys to navigate, Enter to select, Esc to cancel
- Sessions persist across restarts

## 🔧 Dev

```bash
git clone https://github.com/username/umigent.git
cd umigent
npm install
npm run dev        # Run with ts-node
npm run build      # Compile TypeScript
```

## 📋 Requirements

- **Node.js >= 18** (uses native `fetch`)

## 📄 License

MIT
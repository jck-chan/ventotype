# VentoType

> Fast, open-source, system-wide dictation for macOS and Windows.

VentoType turns your voice into text wherever you can type.

Press your shortcut, speak naturally, and VentoType transcribes your speech and types the result directly at your cursor.

No separate editor. No copy-paste. Just dictate and keep working.

## ✨ Features

- 🎙️ **System-wide dictation** — works wherever you can type
- ⚡ **Customizable shortcuts** — including macOS `Fn` / `Globe`
- 🖥️ **macOS & Windows**
- 🔌 **Bring your own API** — use the transcription provider you prefer
- 🤖 **Multiple API styles**
  - OpenAI-compatible `/audio/transcriptions`
  - OpenAI-compatible `/chat/completions`
  - OpenRouter transcription
- 🧩 **Multiple transcription profiles** — configure different endpoints, models, prompts, and languages
- 🔀 **Reorderable profiles**
- ⌨️ **Direct text input** — transcribed text is typed at your cursor
- 📋 **Clipboard-friendly** — VentoType does not touch your clipboard unless you enable copying
- ⛔ **Cancel anytime** — press `Esc` while recording or transcribing
- 🧪 **Built-in Playground** — test providers, models, prompts, and audio without leaving VentoType
- 🪶 **Lightweight background app** — lives in the menu bar / system tray

## 🎯 Why VentoType?

VentoType focuses on doing **dictation properly**.

It is inspired by tools such as [Typeless](https://www.typeless.com/) and [OpenTypeless](https://github.com/RealKai42/open-typer), but takes a simpler, configurable approach.

Instead of trying to reproduce every feature of a full AI productivity suite, VentoType focuses on the core workflow:

**Shortcut → Speak → Transcribe → Text appears where you are typing**

You can bring your own transcription API and choose how your voice is processed.

## 🔌 Supported providers

VentoType supports several API formats rather than locking you to a single provider.

### OpenAI-compatible Transcription

Uses:

```text
/audio/transcriptions

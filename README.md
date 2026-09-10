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
````

This works with compatible services such as OpenAI, Groq, and local Whisper-compatible servers.

### OpenAI-compatible Chat Completions

Uses:

```text
/chat/completions
```

This allows multimodal audio models and system prompts to be used for transcription.

### OpenRouter

VentoType supports OpenRouter's audio transcription interface, allowing compatible models to be accessed through a single API.

## 🧩 Transcription profiles

Create separate profiles for different workflows.

For example:

* Fast everyday dictation
* More accurate transcription
* Technical vocabulary
* Different languages
* Different API providers
* Different models

Each profile can have its own endpoint, API key, model, language, and prompt configuration.

Profiles can also be reordered directly in the settings.

## 🧪 Playground

VentoType includes a Playground for testing transcription configurations.

You can:

* Record audio
* Drop an audio file
* Select a transcription profile
* Inspect the resulting transcript
* Inspect the raw API response

This makes it easier to experiment with different providers and models before using them for everyday dictation.

## ⌨️ Shortcuts

VentoType supports Electron keyboard accelerators and native macOS handling for the `Fn` / `Globe` key.

On macOS, VentoType uses a native event tap for reliable `Fn` / `Globe` detection.

The shortcut can be customized in settings.

While a dictation is active:

* Start/stop dictation with your configured shortcut
* Press `Esc` to cancel the current operation

## 🖥️ Platform support

| Platform | Status      |
| -------- | ----------- |
| macOS    | ✅ Supported |
| Windows  | ✅ Supported |

### macOS permissions

VentoType requires:

* **Microphone** — to record your voice
* **Accessibility** — to type the transcription into other applications and handle system-wide shortcuts

## 🚀 Getting started

### Download

Download the latest release from the [Releases](https://github.com/jck-chan/ventotype/releases) page.

### Development

Requirements:

* Node.js
* npm

Clone the repository:

```bash
git clone https://github.com/jck-chan/ventotype.git
cd ventotype
```

Install dependencies:

```bash
npm install
```

Start the development build:

```bash
npm run dev
```

### Build

Build the application:

```bash
npm run build
```

Create a macOS distribution:

```bash
npm run dist:mac
```

Create a Windows distribution:

```bash
npm run dist:win
```

## ⚙️ Configuration

After launching VentoType:

1. Open Settings
2. Create or select a transcription profile
3. Configure your API endpoint and credentials
4. Select your model
5. Configure your language and prompt if needed
6. Set your dictation shortcut
7. Start dictating

## 🔐 Privacy

VentoType does not require a VentoType-operated transcription service.

You choose the API endpoint used for transcription and provide your own credentials.

Audio is sent to the transcription endpoint configured in your active profile.

Check the privacy and data-retention policies of the provider you choose before using sensitive audio.

## 🛠️ Tech stack

VentoType is built with:

* Electron
* TypeScript
* Vite
* Native Swift components on macOS
* `koffi` for native integration

The application uses a small native layer where platform APIs are needed, while the main application logic remains in TypeScript.

## 🗺️ Roadmap

VentoType is intentionally focused on its core dictation experience.

Possible future improvements include:

* Ask AI with an optional screenshot -> AI type/answer
* Text cleanup
* Audio preprocessing
* Improved onboarding

The project does **not** aim to become a full AI assistant.

## 🤝 Contributing

Issues, bug reports, feature requests, and pull requests are welcome.

If you find a problem, please open an issue with:

* Operating system and version
* VentoType version
* Transcription provider
* Model
* Steps to reproduce the issue
* Relevant logs or error messages

## 📄 License

VentoType is licensed under the [MIT License](LICENSE).

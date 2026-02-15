# OpenClaw + VOICEVOX Integration Design

## Overview

Stack-chan MOD that connects to OpenClaw (OpenAI Chat Completions API compatible server on cloud) for dialogue and VOICEVOX (on a separate LAN PC) for text-to-speech, with Google Speech-to-Text for voice input.

## Architecture

```
[Button A press]
    |
[Mic recording] (robot.record())
    |
[Google STT] (speech.googleapis.com)
    -> audio -> text
    |
[OpenClaw] (cloud instance, Chat Completions API)
    -> user text -> AI response text
    |
[VOICEVOX] (separate PC on same LAN)
    -> text -> audio stream
    |
[Speaker playback] (M5Stack AudioOut)
```

## Components

### 1. ChatCompletionsDialogue (`stackchan/dialogues/dialogue-openai-compat.ts`)

New dialogue class for OpenAI Chat Completions API (`/v1/chat/completions`) compatible servers.

- `apiUrl`: Endpoint URL
- `apiKey`: Bearer token
- `model`: Model name
- `instructions`: System prompt (Stack-chan personality)
- `post(message)`: Sends `[system, user]` messages (no history - managed by OpenClaw server side)
- `clear()`: For interface compatibility (no-op)

### 2. Google STT (`stackchan/transcriptions/stt-google.ts`)

New STT class using Google Cloud Speech-to-Text REST API.

- `apiKey`: Google Cloud API key
- `language`: Recognition language (default: "ja-JP")
- `transcribe(buffer)`: Sends base64-encoded audio to `speech.googleapis.com/v1/speech:recognize`

### 3. MOD (`mods/openclaw_voicevox/`)

New MOD that wires everything together:

- Loads preferences for OpenClaw, VOICEVOX, and Google STT
- Initializes `ChatCompletionsDialogue`, `tts-voicevox` TTS, and Google STT
- Button A: record -> transcribe -> chat -> speak

## Configuration (Preferences)

| Category | Key | Purpose | Example |
|----------|-----|---------|---------|
| `ai` | `google_stt_key` | Google STT API key | `AIza...` |
| `ai` | `openclaw_url` | OpenClaw endpoint | `http://xxx:8000/v1/chat/completions` |
| `ai` | `openclaw_key` | OpenClaw API key | `key-...` |
| `ai` | `openclaw_model` | Model name | `openclaw-v1` |
| `tts` | `host` | VOICEVOX PC IP | `192.168.1.21` |
| `tts` | `port` | VOICEVOX port | `50021` |

## Files to Create/Modify

| File | Type | Content |
|------|------|---------|
| `stackchan/dialogues/dialogue-openai-compat.ts` | New | Chat Completions API client |
| `stackchan/transcriptions/stt-google.ts` | New | Google Speech-to-Text client |
| `stackchan/dialogues/manifest_dialogue.json` | Modify | Register new dialogue module |
| `stackchan/transcriptions/manifest_transcription.json` | Modify | Register new STT module |
| `mods/openclaw_voicevox/manifest.json` | New | MOD manifest |
| `mods/openclaw_voicevox/mod.js` | New | MOD implementation |

## Design Decisions

- **No conversation history on Stack-chan side**: OpenClaw manages history server-side
- **System prompt included**: Stack-chan personality prompt sent with each request
- **Separate API keys**: Google STT and OpenClaw use different authentication
- **Reusable core classes**: dialogue and STT classes added to core for future reuse
- **Existing tts-voicevox reused as-is**: Direct HTTP connection to VOICEVOX on LAN

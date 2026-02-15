# OpenClaw + VOICEVOX Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Stack-chan MOD that uses OpenClaw (Chat Completions API) for dialogue, VOICEVOX for speech, and Google STT for voice input.

**Architecture:** New `ChatCompletionsDialogue` class in core for OpenAI-compatible Chat Completions API, new `GoogleSTT` class for Google Speech-to-Text, and a new MOD wiring them together with existing `tts-voicevox`.

**Tech Stack:** TypeScript (Moddable SDK), HTTP fetch API, OpenAI Chat Completions API format, Google Cloud Speech-to-Text REST API, VOICEVOX REST API.

**Design doc:** `docs/plans/2026-02-15-openclaw-voicevox-design.md`

---

### Task 1: Create ChatCompletionsDialogue class

**Files:**
- Create: `firmware/stackchan/dialogues/dialogue-openai-compat.ts`

**Reference:** `firmware/stackchan/dialogues/dialogue-chatgpt.ts` for patterns (fetch, Headers, Maybe type), `firmware/stackchan/dialogues/dialogue-gemini.ts` for simpler dialogue structure.

**Step 1: Create the dialogue class**

```typescript
import { fetch } from 'fetch'
import Headers from 'headers'
import type { Maybe } from 'stackchan-util'

const DEFAULT_INSTRUCTIONS = `You are "ｽﾀｯｸﾁｬﾝ(Stack-chan)", a palm-sized super kawaii companion robot.
- Creator: ししかわ(Shishikawa)
- Age: 3 years old
- Personality: Always energetic and friendly
- Spreading joy and cuteness around the world
- Talk in simple, frank sentences
`

type ChatCompletionsDialogueProps = {
  apiUrl: string
  apiKey: string
  model: string
  instructions?: string
}

export class ChatCompletionsDialogue {
  #apiUrl: string
  #apiKey: string
  #model: string
  #instructions: string

  constructor({ apiUrl, apiKey, model, instructions = DEFAULT_INSTRUCTIONS }: ChatCompletionsDialogueProps) {
    this.#apiUrl = apiUrl
    this.#apiKey = apiKey
    this.#model = model
    this.#instructions = instructions
  }

  clear() {
    // No history to clear — managed server-side
  }

  async post(message: string): Promise<Maybe<string>> {
    try {
      const body = {
        model: this.#model,
        messages: [
          { role: 'system', content: this.#instructions },
          { role: 'user', content: message },
        ],
      }
      const headers = new Headers([
        ['Content-Type', 'application/json'],
        ['Authorization', `Bearer ${this.#apiKey}`],
      ])
      const response = await fetch(this.#apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const status = response.status
      if (2 !== Math.idiv(status, 100)) {
        return { success: false, reason: `HTTP error: ${status} ${response.statusText}` }
      }
      const obj = await response.json()
      const text = obj.choices?.[0]?.message?.content
      if (text == null) {
        return { success: false, reason: 'No content in response' }
      }
      return { success: true, value: text }
    } catch (error) {
      return { success: false, reason: error.message || 'Unknown error' }
    }
  }

  get history() {
    return []
  }
}
```

**Step 2: Verify the file compiles in context**

Skim the file for any import issues. All imports (`fetch`, `Headers`, `stackchan-util`) are available in the existing dialogue manifest.

**Step 3: Commit**

```bash
git add firmware/stackchan/dialogues/dialogue-openai-compat.ts
git commit -m "feat: add ChatCompletionsDialogue for OpenAI-compatible APIs"
```

---

### Task 2: Register ChatCompletionsDialogue in manifest

**Files:**
- Modify: `firmware/stackchan/dialogues/manifest_dialogue.json`

**Step 1: Add the new module to preload list**

In `manifest_dialogue.json`, add `"dialogue-openai-compat"` to the `preload` array:

```json
"preload": ["dialugue-chatgpt", "dialugue-claude", "dialugue-gemini", "dialogue-openai-compat"],
```

Note: The existing typos (`dialugue-` instead of `dialogue-`) are intentional — they match the existing file. Our new module uses the correct spelling.

**Step 2: Commit**

```bash
git add firmware/stackchan/dialogues/manifest_dialogue.json
git commit -m "feat: register dialogue-openai-compat module in manifest"
```

---

### Task 3: Create Google STT class

**Files:**
- Create: `firmware/stackchan/transcriptions/stt-google.ts`

**Reference:** `firmware/stackchan/transcriptions/stt-whisper.ts` for patterns (fetch, Headers, Maybe type, multipart upload pattern). Google Speech-to-Text v1 uses JSON with base64-encoded audio instead.

**Step 1: Create the STT class**

Note: Moddable SDK has `Base64.encode()` from the `base64` module. Check availability or use a manual encoding approach. The Whisper STT uses raw ArrayBuffer in multipart. For Google STT, we need base64-encoded audio in JSON.

```typescript
import { fetch } from 'fetch'
import Headers from 'headers'
import type { Maybe } from 'stackchan-util'

const API_URL = 'https://speech.googleapis.com/v1/speech:recognize'

export type GoogleSTTProperty = {
  apiKey: string
  language?: string
  sampleRate?: number
}

export default class GoogleSTT {
  #apiKey: string
  #language: string
  #sampleRate: number

  constructor(props: GoogleSTTProperty) {
    this.#apiKey = props.apiKey
    this.#language = props.language ?? 'ja-JP'
    this.#sampleRate = props.sampleRate ?? 16000
  }

  async transcribe(buffer: ArrayBuffer | HostBuffer): Promise<Maybe<string>> {
    try {
      const base64Audio = this.#encodeBase64(buffer)
      const body = {
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: this.#sampleRate,
          languageCode: this.#language,
        },
        audio: {
          content: base64Audio,
        },
      }

      const response = await fetch(`${API_URL}?key=${this.#apiKey}`, {
        method: 'POST',
        headers: new Headers([['Content-Type', 'application/json']]),
        body: JSON.stringify(body),
      })

      if (response.status !== 200) {
        return { success: false, reason: `request error: ${response.status}(${response.statusText})` }
      }

      const obj = await response.json()
      const transcript = obj.results?.[0]?.alternatives?.[0]?.transcript
      if (transcript == null) {
        return { success: false, reason: 'No transcription result' }
      }
      return { success: true, value: transcript }
    } catch (error) {
      return { success: false, reason: `Exception occurred: ${error.message}` }
    }
  }

  #encodeBase64(buffer: ArrayBuffer | HostBuffer): string {
    const bytes = new Uint8Array(buffer)
    const lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let result = ''
    const len = bytes.length
    for (let i = 0; i < len; i += 3) {
      const b0 = bytes[i]
      const b1 = i + 1 < len ? bytes[i + 1] : 0
      const b2 = i + 2 < len ? bytes[i + 2] : 0
      result += lookup[b0 >> 2]
      result += lookup[((b0 & 3) << 4) | (b1 >> 4)]
      result += i + 1 < len ? lookup[((b1 & 0x0f) << 2) | (b2 >> 6)] : '='
      result += i + 2 < len ? lookup[b2 & 0x3f] : '='
    }
    return result
  }
}
```

**Step 2: Verify imports and patterns match existing STT code**

All imports (`fetch`, `Headers`, `stackchan-util`) are the same as `stt-whisper.ts`. The class exports `default` just like Whisper.

**Important note:** The `#encodeBase64` method is a manual implementation because Moddable SDK's `Base64` module availability needs verification. During implementation, check if `import Base64 from 'base64'` works — if so, replace the manual method with `Base64.encode(buffer)`.

**Step 3: Commit**

```bash
git add firmware/stackchan/transcriptions/stt-google.ts
git commit -m "feat: add Google Speech-to-Text STT class"
```

---

### Task 4: Register Google STT in manifest

**Files:**
- Modify: `firmware/stackchan/transcriptions/manifest_transcription.json`

**Step 1: Add the new module to preload list**

In `manifest_transcription.json`, add `"stt-google"` to the `preload` array:

```json
"preload": ["stt-whisper", "stt-google"],
```

Also add the Google STT CA certificate. Google uses widely-trusted certs, so the existing `ca236` may work. If not, the specific CA cert will need to be identified during testing.

**Step 2: Commit**

```bash
git add firmware/stackchan/transcriptions/manifest_transcription.json
git commit -m "feat: register stt-google module in manifest"
```

---

### Task 5: Create the MOD

**Files:**
- Create: `firmware/mods/openclaw_voicevox/manifest.json`
- Create: `firmware/mods/openclaw_voicevox/mod.js`

**Reference:** `firmware/mods/ai_stackchan/mod.js` for the full record→transcribe→chat→speak pattern, `firmware/mods/voicevox_test/mod.js` for VOICEVOX TTS setup.

**Step 1: Create manifest.json**

```json
{
  "include": ["$(MODDABLE)/examples/manifest_mod.json"],
  "modules": {
    "*": ["./mod"]
  }
}
```

**Step 2: Create mod.js**

```javascript
import { ChatCompletionsDialogue } from 'dialogue-openai-compat'
import GoogleSTT from 'stt-google'
import { TTS } from 'tts-voicevox'
import loadPreferences from 'loadPreference'
import { createHeartDecorator, createSweatDecorator } from 'decorator'

const heartDecorator = createHeartDecorator({ x: 20, y: 20 })
const sweatDecorator = createSweatDecorator({ x: 20, y: 20 })

export function onRobotCreated(robot) {
  const aiPrefs = loadPreferences('ai')
  const ttsPrefs = loadPreferences('tts')

  // Initialize ChatCompletionsDialogue for OpenClaw
  const dialogue = new ChatCompletionsDialogue({
    apiUrl: aiPrefs.openclaw_url,
    apiKey: aiPrefs.openclaw_key,
    model: aiPrefs.openclaw_model,
  })

  // Initialize Google STT
  const stt = new GoogleSTT({
    apiKey: aiPrefs.google_stt_key,
  })

  // Initialize VOICEVOX TTS
  robot.useTTS(
    new TTS({
      host: ttsPrefs.host,
      port: ttsPrefs.port ?? 50021,
      sampleRate: ttsPrefs.sampleRate ?? 24000,
    })
  )

  let talking = false

  async function talk() {
    if (talking) {
      return
    }
    talking = true
    let result
    let decorator

    async function handleError(message) {
      trace(`${message}\n`)
      talking = false
      robot.renderer.removeDecorator(decorator)
      robot.setEmotion('NEUTRAL')
      await robot.say(message)
    }

    // Recording phase
    decorator = heartDecorator
    robot.renderer.addDecorator(decorator)
    robot.setEmotion('HAPPY')

    trace('start recording.\n')
    let buffer
    try {
      buffer = await robot.record()
    } catch (error) {
      trace(`recording failed: ${error.message}`)
      handleError('録音できませんでした')
      return
    }
    await robot.tone(600, 100)
    trace('end recording.\n')

    // Transcription phase (Google STT)
    trace('start transcription.\n')
    result = await stt.transcribe(buffer)
    if (!result.success) {
      trace(`transcription failed: ${result.reason}`)
      handleError('聞き取れませんでした')
      return
    }
    trace(`transcription text: ${result.value}\n`)

    // Thinking phase
    robot.renderer.removeDecorator(decorator)
    decorator = sweatDecorator
    robot.renderer.addDecorator(decorator)
    robot.setEmotion('DOUBTFUL')

    // Chat phase (OpenClaw)
    trace('start completion.\n')
    result = await dialogue.post(result.value)
    if (!result.success) {
      trace(`completion failed: ${result.reason}`)
      handleError('わかりません！')
      return
    }
    trace(`completion text: ${result.value}\n`)

    // Speech phase (VOICEVOX)
    await robot.say(result.value)
    talking = false

    // Reset face
    robot.renderer.removeDecorator(decorator)
    robot.setEmotion('NEUTRAL')
  }

  // Button A: record and chat
  robot.button.a.onChanged = async function () {
    if (this.read()) {
      await robot.tone(1000, 100)
      await talk()
    }
  }

  // Button B: test chat with fixed text
  robot.button.b.onChanged = async function () {
    if (this.read()) {
      if (talking) return
      talking = true
      const result = await dialogue.post('こんにちは')
      if (result.success) {
        await robot.say(result.value)
      }
      talking = false
    }
  }

  // Button C: test TTS only
  robot.button.c.onChanged = async function () {
    if (this.read()) {
      if (talking) return
      talking = true
      await robot.say('こんにちは。ぼくｽﾀｯｸﾁｬﾝ！')
      talking = false
    }
  }
}

export default {
  onRobotCreated,
}
```

**Step 3: Commit**

```bash
git add firmware/mods/openclaw_voicevox/manifest.json firmware/mods/openclaw_voicevox/mod.js
git commit -m "feat: add openclaw_voicevox MOD"
```

---

### Task 6: Verify build

**Step 1: Run lint**

```bash
cd firmware && npm run lint
```

Fix any lint errors.

**Step 2: Attempt build (if simulator target available)**

```bash
cd firmware && npm_config_target=mac/m5stack npm run build
```

Or for the actual target:

```bash
cd firmware && npm run build
```

**Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix: resolve lint and build issues"
```

---

## Deployment Notes

After build, configure preferences on the device:

```
# AI preferences
ai.openclaw_url = http://<cloud-ip>:<port>/v1/chat/completions
ai.openclaw_key = <your-api-key>
ai.openclaw_model = <model-name>
ai.google_stt_key = <google-cloud-api-key>

# TTS preferences (VOICEVOX)
tts.type = voicevox
tts.host = <voicevox-pc-ip>
tts.port = 50021

# Driver preferences (as needed for your hardware)
```

Flash the MOD:
```bash
cd firmware && npm run mod mods/openclaw_voicevox/manifest.json
```

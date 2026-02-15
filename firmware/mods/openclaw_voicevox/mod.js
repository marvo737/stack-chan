import { ChatCompletionsDialogue } from 'dialogue-openai-compat'
import Whisper from 'stt-whisper'
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

  // Initialize Whisper STT
  const stt = new Whisper({
    apiKey: aiPrefs.token,
  })

  // Initialize VOICEVOX TTS
  robot.useTTS(
    new TTS({
      host: ttsPrefs.host,
      port: ttsPrefs.port ?? 50021,
      sampleRate: ttsPrefs.sampleRate ?? 24000,
    }),
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

    // Transcription phase (Whisper)
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

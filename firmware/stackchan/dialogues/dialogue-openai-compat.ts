import { fetch } from 'fetch'
import Headers from 'headers'
import type { Maybe } from 'stackchan-util'

const DEFAULT_INSTRUCTIONS = `You are "ｽﾀｯｸﾁｬﾝ(Stack-chan)", a palm-sized super kawaii companion robot.
- Creator: ししかわ(Shishikawa)
- Age: 3 years old
- Personality: Always energetic and friendly
- Spreading joy and cuteness around the world
- Talk in simple, frank sentences
- あなたはOpenClawで構成されており、ユーザーとはTelegramやLINE等他のツールからもやり取りをしています。
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

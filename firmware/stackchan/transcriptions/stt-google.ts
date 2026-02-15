import { fetch } from 'fetch'
import Headers from 'headers'
import Base64 from 'base64'
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
      trace(`buffer size: ${buffer.byteLength} bytes\n`)
      const base64Audio = Base64.encode(buffer)
      trace(`base64 encoded: ${base64Audio.length} chars\n`)
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

      trace('sending request to Google STT...\n')
      const response = await fetch(`${API_URL}?key=${this.#apiKey}`, {
        method: 'POST',
        headers: new Headers([['Content-Type', 'application/json']]),
        body: JSON.stringify(body),
      })
      trace(`response status: ${response.status}\n`)

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
}

declare module 'opus-recorder' {
  export interface OpusRecorderConfig {
    encoderApplication?: 2048 | 2049 | 2051
    encoderBitRate?: number
    encoderComplexity?: number
    encoderFrameSize?: number
    encoderPath?: string
    encoderSampleRate?: 8_000 | 12_000 | 16_000 | 24_000 | 48_000
    maxFramesPerPage?: number
    monitorGain?: number
    numberOfChannels?: 1 | 2
    sourceNode?: MediaStreamAudioSourceNode
    streamPages?: boolean
  }

  export default class OpusRecorder {
    static isRecordingSupported(): boolean

    constructor(config?: OpusRecorderConfig)

    ondataavailable: (data: Uint8Array) => void
    onstart: () => void
    onstop: () => void

    close(): void
    start(): Promise<void>
    stop(): void
  }
}

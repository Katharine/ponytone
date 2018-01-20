import {getNoteFromBuffer, Note} from "./pitch";
import {getAudioContext} from "../util/audio-context";
import {Song} from "../ultrastar/parser";
import {EventEmitter} from "events";


const SAMPLES_PER_BUFFER = 1024;
const BUFFERS_REQUIRED = 1;  // I'm not convinced this works properly when > 1
const TOTAL_SAMPLES = SAMPLES_PER_BUFFER * BUFFERS_REQUIRED;

export class LiveAudio extends EventEmitter {
    ready: boolean;
    onnote: (note: Note) => void;
    source: MediaStreamAudioSourceNode;

    private context: AudioContext;
    private analyser: ScriptProcessorNode;
    private biquad: BiquadFilterNode;
    private dummy: AnalyserNode;
    private gain: GainNode;
    private stream: MediaStream;
    private _buffers: Float32Array[];

    constructor() {
        super();
        this.ready = false;
        this.context = getAudioContext();
        this.analyser = this.context.createScriptProcessor(SAMPLES_PER_BUFFER);
        this.analyser.onaudioprocess = (e) => this._processAudio(e);
        this.biquad = this.context.createBiquadFilter();
        this.biquad.type = "lowpass";
        this.biquad.frequency.value = 2500;
        this.biquad.Q.value = 0.5;
        this.dummy = this.context.createAnalyser();
        this.dummy.fftSize = 32;
        this.source = null;
        this.gain = this.context.createGain();
        this.gain.gain.value = 1;
        this._buffers = [];
        this._getMedia();
    }

    on(event: 'failed', listener: () => any): this {
        return super.on(event, listener);
    }

    private async _getMedia(): Promise<void> {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia(<any>{
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    googAutoGainControl: false,
                    mozAutoGainControl: false,
                    googNoiseSuppression: false,
                    mozNoiseSuppression: false,
                }
            });
        } catch (e) {
            this.ready = false;
            console.error("Media failed.");
            console.log(e);
            this.emit("failed");
        }

        this.source = this.context.createMediaStreamSource(this.stream);
        this.source.connect(this.gain);
        this.gain.connect(this.biquad);
        this.biquad.connect(this.analyser);
        this.analyser.connect(this.dummy);
        this.ready = true;
    }

    _processAudio(e: AudioProcessingEvent): void {
        let buffer = e.inputBuffer.getChannelData(0);
        if (this._buffers.length >= BUFFERS_REQUIRED) {
            this._buffers.shift();
        }
        let newBuffer = new Float32Array(buffer.length);
        newBuffer.set(buffer);
        this._buffers.push(newBuffer);
        if (this._buffers.length < BUFFERS_REQUIRED) {
            return;
        }
        let fullBuffer = new Float32Array(TOTAL_SAMPLES);
        for (let [i, b] of this._buffers.entries()) {
            fullBuffer.set(b, i * SAMPLES_PER_BUFFER);
        }
        let note = getNoteFromBuffer(fullBuffer, this.context.sampleRate);
        if (note.number) {
            if (this.onnote) {
                this.onnote(note);
            }
        }
    }

    static isAudioAvailable(): boolean {
        if (!(window.AudioContext || window.webkitAudioContext)) {
            return false;
        }
        if (!navigator.mediaDevices) {
            return false;
        }
        return true;
    }

    static requestPermissions(): void {
        navigator.mediaDevices.getUserMedia({audio: true});
    }
}

export interface AudioTrack {
    currentTime: number;
}

export interface SungNote {
    time: number;
    note: number;
}

export class Singing {
    song: Song;
    audio: LiveAudio;
    track: AudioTrack;
    notes: SungNote[];
    currentBeat: number;
    samples: number;
    average: number;

    constructor(song: Song, audio: AudioTrack) {
        this.song = song;
        this.audio = new LiveAudio();
        this.track = audio;
        this.notes = [];
        this.currentBeat = -1;
        this.samples = 0;
        this.average = 0;
    }

    start(): void {
        this.currentBeat = -1;
        this.samples = 0;
        this.average = 0;
        this.audio.onnote = (note) => this._addNote(note);
    }

    stop(): void {
        this.audio.onnote = null;
        if (this.audio.source) {
            this.audio.source.disconnect();
        }
    }

    _addNote(note: Note): void {
        let beat = this.song.msToBeats((this.track.currentTime*1000)|0) - 2;
        if (beat < 0 || beat <= this.currentBeat) {
            return;
        }
        if (isNaN(note.number) || note.number === null || note.number === -Infinity) {
            return;
        }
        if (this.currentBeat === beat) {
            this.average = ((this.average * this.samples) + note.number) / (this.samples);
            this.samples++;
        } else {
            this.notes.push({time: this.currentBeat, note: Math.round(this.average)});
            this.average = note.number;
            this.samples = 1;
            this.currentBeat = beat;
        }
    }

    notesInRange(start: number, end: number): SungNote[] {
        return this.notes.filter((x) => start <= x.time && x.time < end);
    }

    get ready() {
        return this.audio.ready;
    }
}

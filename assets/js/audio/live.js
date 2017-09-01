import {getNoteFromBuffer} from "./pitch";
import {getAudioContext} from "../util/audio-context";

let EventEmitter = require("events");

export class LiveAudio extends EventEmitter {
    constructor() {
        super();
        this.ready = false;
        this.context = getAudioContext();
        this.analyser = this.context.createScriptProcessor(1024);
        this.analyser.onaudioprocess = (e) => this._processAudio(e);
        this.biquad = this.context.createBiquadFilter();
        this.biquad.type = "lowpass";
        this.biquad.frequency.value = 2000;
        this.biquad.Q.value = 0.5;
        this.dummy = this.context.createAnalyser();
        this.dummy.fftSize = 32;
        this.source = null;
        this.gain = this.context.createGain();
        this.gain.gain.value = 1;
        navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                googAutoGainControl: false,
                mozAutoGainControl: false,
                googNoiseSuppression: false,
                mozNoiseSuppression: false,
            }
        })
            .then((stream) => this._handleMedia(stream))
            .catch((err) => this._mediaFailed(err));
    }

    _processAudio(e) {
        let buffer = e.inputBuffer.getChannelData(0);
        let note = getNoteFromBuffer(buffer, this.context.sampleRate);
        if (note.number) {
            if (this.onnote) {
                this.onnote(note);
            }
        }
    }

    _handleMedia(stream) {
        this.stream = stream;
        this.source = this.context.createMediaStreamSource(this.stream);
        this.source.connect(this.gain);
        this.gain.connect(this.biquad);
        this.biquad.connect(this.analyser);
        this.analyser.connect(this.dummy);
        this.ready = true;
    }

    _mediaFailed(err) {
        this.ready = false;
        console.error("Media failed.");
        console.log(err);
        this.emit("failed");
    }

    static isAudioAvailable() {
        if (!(window.AudioContext || window.webkitAudioContext)) {
            return false;
        }
        if (!navigator.mediaDevices) {
            return false;
        }
        return true;
    }

    static requestPermissions() {
        navigator.mediaDevices.getUserMedia({audio: true});
    }
}

export class Singing {
    constructor(song, audio) {
        this.song = song;
        this.audio = new LiveAudio();
        this.track = audio;
        this.interval = null;
        this.notes = [];
        this.currentBeat = -1;
        this.samples = 0;
        this.average = 0;
    }

    start() {
        this.currentBeat = -1;
        this.samples = 0;
        this.average = 0;
        this.audio.onnote = (note) => this._addNote(note);
    }

    stop() {
        this.audio.onnote = null;
        this.audio.source.disconnect();
    }

    _addNote(note) {
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

    notesInRange(start, end) {
        return this.notes.filter((x) => start <= x.time && x.time < end);
    }

    get ready() {
        return audio.ready;
    }
}

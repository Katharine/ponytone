import {getNoteFromFFT} from "./pitch";

let EventEmitter = require("events");

export class LiveAudio extends EventEmitter {
    constructor() {
        super();
        this.ready = false;
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 2048;
        this.fft = new Float32Array(this.analyser.frequencyBinCount);
        this.source = null;
        navigator.mediaDevices.getUserMedia({audio: true, echoCancellation: false})
            .then((stream) => this._handleMedia(stream))
            .catch((err) => this._mediaFailed(err));
    }

    getNoteFromMic() {
        this.analyser.getFloatTimeDomainData(this.fft);
        return getNoteFromFFT(this.fft, this.context.sampleRate);
    }

    _handleMedia(stream) {
        this.stream = stream;
        this.source = this.context.createMediaStreamSource(this.stream);
        this.source.connect(this.analyser);
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
        this.interval = setInterval(() => this._addNote(), 0.3 * 1000 / (this.song.bpm * 4 / 60));
    }

    stop() {
        clearInterval(this.interval);
    }

    _addNote() {
        let beat = this.song.msToBeats((this.track.currentTime*1000)|0) - 2;
        if (beat < 0 || beat <= this.currentBeat) {
            return;
        }
        let note = this.audio.getNoteFromMic();
        if (isNaN(note.number) || note.number === -Infinity) {
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

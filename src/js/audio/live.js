import {getNoteFromFFT} from "./pitch";
// import * as EventEmitter from "events";

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
        navigator.mediaDevices.getUserMedia({audio: true})
            .then((stream) => this._handleMedia(stream))
            .catch((err) => this._mediaFailed(err));
    }

    isReady() {
        return this.ready;
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
}

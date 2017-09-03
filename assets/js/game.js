"use strict";

import {Song} from "./ultrastar/parser";
import {GameDisplay} from "./display";
import {LocalPlayer} from "./player";
import {getAudioContext} from "./util/audio-context";

let EventEmitter = require("events");

export class GameSession extends EventEmitter {
    constructor(container, width, height, songURL) {
        super();
        this.container = container;
        this.width = width;
        this.height = height;
        this.songURL = songURL;
        this.audio = null;
        this.display = null;
        this.players = [];

        this.song = null;
        this._startTime = null;
        this._ready = false;
        this._ac = getAudioContext();
        this._duration = null;
    }

    setSize(width, height) {
        this.width = width;
        this.height = height;
        if (this.display) {
            this.display.setSize(width, height);
        }
    }

    async prepare() {
        try {
            let response = await fetch(this.songURL);
            this._prepare(await response.text());
        } catch (e) {
            this.emit("error", e);
        }
    }

    async start() {
        this.display.createGameLayout();
        await this.display.title();
        if (this.ready) {
            this._startTime = this._ac.currentTime;
            let duration = undefined;
            if (this.song.end) {
                duration = (this.song.end / 1000) - (this.song.start || 0);
            }
            this.audio.start(0, this.song.start || 0, duration);
            this._startedPlaying();
        } else {
            throw new Error("Not ready yet.");
        }
    }

    cleanup() {
        this.display.stop();
        this.container.innerHTML = '';
    }

    addPlayer(player) {
        this.players.push(player);
    }

    _prepare(songText) {
        this.song = new Song(this._baseURL, songText);

        this.audio = this._ac.createBufferSource();
        this.audio.connect(this._ac.destination);
        this.audio.addEventListener('ended', () => this._stoppedPlaying());
        this._fetchAudio();

        this.display = new GameDisplay(this.container, this.width, this.height, this.song, this.players, this);
        this.display.on('ready', () => this._maybeReady());
        this.display.prepareVideo();
    }

    async _fetchAudio() {
        try {
            let result = await fetch(this.song.mp3);
            let buffer = await result.arrayBuffer();
            let decoded = await this._ac.decodeAudioData(buffer);
            this._duration = decoded.duration;
            this.audio.buffer = decoded;
            this._maybeReady()
        } catch (e) {
            console.error("Failed", e);
        }
    }

    _maybeReady() {
        console.log('maybeReady', this.audio.buffered, this.display.ready);
        if (this.audio.buffer) {
            console.log(`Audio ready.`);
            if (this.display.ready) {
                this._definitelyReady();
            }
        }
    }

    async _startedPlaying() {
        await this.display.start();
        for (let player of this.players) {
            player.start();
        }
    }

    _stoppedPlaying() {
        this.display.stop();
        for (let player of this.players) {
            player.stop();
        }
        this.emit("finished");
    }

    _definitelyReady() {
        console.log('definitelyReady');
        this._ready = true;
        this.emit('ready');
    }

    get localPlayer() {
        for (let player of this.players) {
            if (player instanceof LocalPlayer) {
                return player;
            }
        }
        return null;
    }

    get currentTime() {
        if (this._startTime === null) {
            return 0;
        }
        return this._ac.currentTime - this._startTime + (this.song.start || 0);
    }

    get _baseURL() {
        return this.songURL.split('/').slice(0, -1).join('/');
    }

    get ready() {
        return this._ready;
    }

    get duration() {
        let duration = this._duration;
        if (this.song.end) {
            duration = (this.song.end / 1000);
        }
        duration -= this.song.start || 0;
        return duration;
    }
}

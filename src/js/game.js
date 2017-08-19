"use strict";

import {Song} from "./ultrastar/parser";
import {GameDisplay} from "./display";
import {LocalPlayer} from "./player";
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
        this._ready = false;
    }

    prepare() {
        fetch(this.songURL)
            .then((response) => response.text())
            .catch((e) => this.emit("error", e))
            .then((text) => this._prepare(text))
    }

    start() {
        if (this.ready) {
            this.audio.play();
        } else {
            throw new Error("Not ready yet.");
        }
    }

    _prepare(songText) {
        this.song = new Song(this._baseURL, songText);

        this.audio = new Audio(this.song.mp3);
        this.audio.preload = 'auto';
        this.audio.addEventListener('canplaythrough', () => this._maybeReady());
        this.audio.addEventListener('playing', () => this._startedPlaying());
        this.audio.addEventListener('stopped', () => this._stoppedPlaying());
        this.players = [new LocalPlayer(this.song, 0, this.audio)];
        for (let player of this.players) {
            player.prepare();
        }
        this.display = new GameDisplay(this.container, this.width, this.height, this.song, this.players, this.audio);
        this.display.on('ready', () => this._maybeReady());
        this.display.createGameLayout();
    }

    _maybeReady() {
        console.log('maybeReady', this.audio.readyState, this.display.ready);
        if (this.audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
            if (this.display.ready) {
                this._definitelyReady();
            }
        }
    }

    _startedPlaying() {
        console.log('startedPlaying');
        this.display.start();
        for (let player of this.players) {
            player.start();
        }
    }

    _stoppedPlaying() {
        this.display.stop();
        for (let player of this.players) {
            player.stop();
        }
    }

    _definitelyReady() {
        console.log('definitelyReady');
        this._ready = true;
        this.emit('ready');
    }

    get _baseURL() {
        return this.songURL.split('/').slice(0, -1).join('/');
    }

    get ready() {
        return this._ready;
    }
}

"use strict";

import {LyricRenderer, NoteRenderer, ScoreRenderer} from "./ultrastar/render";

let EventEmitter = require("events");

export class GameDisplay extends EventEmitter {
    constructor(container, width, height, song, players, audio) {
        super();
        this.song = song;
        this.container = container;
        this.width = width;
        this.height = height;
        this.players = players;
        this.audio = audio;
        this.div = null;
        this.videoElement = null;
        this.canvasElement = null;
        this._currentCanvasScale = null;
        this.lyricRenderers = [];
        this.noteRenderers = [];
        this.scoreRenderers = [];
        this.running = false;
        this._ready = false;
        this._scaleInterval = null;
    }

    createGameLayout() {
        this.canvasElement = document.createElement('canvas');
        this._scaleCanvas();
        this.canvasElement.style.position = 'absolute';
        this.canvasElement.style.top = 0;
        this.canvasElement.style.left = 0;

        this.videoElement = document.createElement('video');
        this.videoElement.height = this.height;
        this.videoElement.width = this.width;
        this.videoElement.preload = "auto";
        this.videoElement.poster = this.song.background;
        this.videoElement.addEventListener("canplaythrough", () => {
            this._ready = true;
            this.emit("ready");
        });

        this.div = document.createElement('div');
        this.div.style.position = 'relative';

        this.div.appendChild(this.videoElement);
        this.div.appendChild(this.canvasElement);
        this.container.appendChild(this.div);

        if (this.players.length !== 1) {
            throw new Error("Only one player supported right now.");
        }

        this.lyricRenderers = [new LyricRenderer(this.canvasElement, 0, 660, 1280, 60)];
        this.lyricRenderers[0].setSong(this.song);
        this.noteRenderers = [new NoteRenderer(this.canvasElement, 20, 410, 1240, 250)];
        this.noteRenderers[0].setSong(this.song);
        this.noteRenderers[0].setPlayer(this.players[0]);
        this.scoreRenderers = [new ScoreRenderer(this.canvasElement, 1150, 350, 110, 60)];
        this.scoreRenderers[0].setPlayer(this.players[0]);

        if (this.song.video) {
            this.videoElement.src = this.song.video;
        } else {
            setTimeout(() => {
                this._ready = true;
                this.emit("ready");
            }, 0);
        }
    }

    get ready() {
        return this._ready;
    }

    start() {
        this.running = true;
        this.videoElement.currentTime = 0;
        if (this.videoElement.src) {
            this.videoElement.play();
        }
        this._scaleInterval = setInterval(() => this._scaleCanvas(), 1000);
        requestAnimationFrame(() => this._renderFrame());
    }

    stop() {
        clearInterval(this._scaleInterval);
        this.videoElement.pause();
        this.running = false;
    }

    _renderFrame() {
        if (!this.running) {
            return;
        }
        if (this.videoElement.src && Math.abs(this.videoElement.currentTime - this.audio.currentTime) > 0.2) {
            console.log('A/V desync; disabling.');
            this.videoElement.removeAttribute('src');
            this.videoElement.load();
        }

        let time = (this.audio.currentTime * 1000) | 0;

        for (let lyricRenderer of this.lyricRenderers) {
            lyricRenderer.render(time);
        }
        for (let noteRenderer of this.noteRenderers) {
            noteRenderer.render(time);
        }
        for (let scoreRenderer of this.scoreRenderers) {
            scoreRenderer.render();
        }
        requestAnimationFrame(() => this._renderFrame());
    }

    _scaleCanvas() {
        // assume the device pixel ratio is 1 if the browser doesn't specify it
        const devicePixelRatio = window.devicePixelRatio || 1;
        if (this._currentCanvasScale === devicePixelRatio) {
            return;
        }
        this._currentCanvasScale = devicePixelRatio;

        // determine the 'backing store ratio' of the canvas context
        let context = this.canvasElement.getContext('2d');
        const backingStoreRatio = (
            context.webkitBackingStorePixelRatio ||
            context.mozBackingStorePixelRatio ||
            context.msBackingStorePixelRatio ||
            context.oBackingStorePixelRatio ||
            context.backingStorePixelRatio || 1
        );

        // determine the actual ratio we want to draw at
        const ratio = devicePixelRatio / backingStoreRatio;

        let canvas = this.canvasElement;

        if (devicePixelRatio !== backingStoreRatio) {
            // set the 'real' canvas size to the higher width/height
            canvas.width = this.width * ratio;
            canvas.height = this.height * ratio;

            // ...then scale it back down with CSS
            canvas.style.width = this.width + 'px';
            canvas.style.height = this.height + 'px';
        }
        else {
            // this is a normal 1:1 device; just scale it simply
            canvas.width = this.width;
            canvas.height = this.height;
            canvas.style.width = '';
            canvas.style.height = '';
        }

        // scale the drawing context so everything will work at the higher ratio
        context.scale(ratio, ratio);
    }
}

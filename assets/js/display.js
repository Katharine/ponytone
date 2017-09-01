"use strict";

import {LyricRenderer, NoteRenderer, ScoreRenderer, TitleRenderer} from "./ultrastar/render";

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
        this._gapTimer = null;
        this._canKillVideo = false; // Chrome throws a fit if we unload a video it's trying to start playing.
        this.container.style.overflow = 'hidden';
        this.container.style.width = `${width}px`;
        this.container.style.height = `${height}px`;
    }

    setSize(width, height) {
        this.width = width;
        this.height = height;
        this.container.style.width = `${width}px`;
        this.container.style.height = `${height}px`;
        this._scaleCanvas(true);
        this._updateVideoSize();
        this.updateLayout();
    }

    createGameLayout() {
        console.log("players", this.players);
        this.canvasElement = document.createElement('canvas');
        this.canvasElement.style.position = 'absolute';
        this.canvasElement.style.top = 0;
        this.canvasElement.style.left = 0;
        this._scaleCanvas();

        this.div = document.createElement('div');
        this.div.style.position = 'relative';

        this.div.appendChild(this.videoElement);
        this.div.appendChild(this.canvasElement);
        this.container.appendChild(this.div);

        for (let i = 0; i < this.song.parts.length; ++i) {
            let renderer = new LyricRenderer(this.canvasElement);
            renderer.setSong(this.song, i);
            this.lyricRenderers.push(renderer);
        }

        for (let i = 0; i < this.players.length; ++i) {
            let notes = new NoteRenderer(this.canvasElement);
            notes.setSong(this.song, this.players[i].part);
            notes.setPlayer(this.players[i]);
            this.noteRenderers.push(notes);

            let score = new ScoreRenderer(this.canvasElement);
            score.setPlayer(this.players[i]);
            this.scoreRenderers.push(score);
        }

        this.updateLayout();
    }

    updateLayout() {
        const SCALE_W = 1280;
        const SCALE_H = 720;
        let cw = this.canvasElement.clientWidth;
        let ch = this.canvasElement.clientHeight;

        let d = (x, y, w, h) => ({x: x / SCALE_W * cw, y: y / SCALE_H * ch, w: w / SCALE_W * cw, h: h / SCALE_H * ch});

        const LYRICS = [d(0, 670, 1280, 50), d(0, 0, 1280, 50)];
        const LAYOUTS = {
            1: [{notes: d(20, 360, 1240, 250), score: d(0, 300, 1260, 60)}],
            2: [{notes: d(20, 430, 1240, 240), score: d(0, 360, 1260, 50)},
                {notes: d(20, 120, 1240, 240), score: d(0, 50, 1260, 50)}],
            3: [{notes: d(20, 462, 1240, 166), score: d(0, 422, 1260, 40)},
                {notes: d(20, 256, 1240, 166), score: d(0, 216, 1260, 40)},
                {notes: d(20, 90, 1240, 166), score: d(0, 50, 1260, 40)}],
            4: [{notes: d(20, 120, 610, 240), score: d(0, 50, 610, 50)},
                {notes: d(650, 120, 610, 240), score: d(650, 50, 610, 50)},
                {notes: d(20, 430, 610, 240), score: d(0, 360, 610, 50)},
                {notes: d(650, 430, 610, 240), score: d(650, 360, 610, 50)}],
            5: [{notes: d(20, 462, 610, 166), score: d(0, 422, 610, 40)},
                {notes: d(650, 462, 610, 166), score: d(650, 422, 610, 40)},
                {notes: d(20, 256, 610, 166), score: d(0, 216, 610, 40)},
                {notes: d(650, 256, 610, 166), score: d(650, 216, 610, 40)},
                {notes: d(20, 90, 610, 166), score: d(0, 50, 610, 40)}],
            6: [{notes: d(20, 462, 610, 166), score: d(0, 422, 610, 40)},
                {notes: d(650, 462, 610, 166), score: d(650, 422, 610, 40)},
                {notes: d(20, 256, 610, 166), score: d(0, 216, 610, 40)},
                {notes: d(650, 256, 610, 166), score: d(650, 216, 610, 40)},
                {notes: d(20, 90, 610, 166), score: d(0, 50, 610, 40)},
                {notes: d(650, 90, 610, 166), score: d(650, 50, 610, 40)}],
        };

        this.canvasElement.getContext('2d').clearRect(0, 0, cw, ch);

        for (let [i, renderer] of this.lyricRenderers.entries()) {
            let {x, y, w, h} = LYRICS[i];
            renderer.setRect(x, y, w, h);
        }

        let layout = LAYOUTS[this.players.length];
        for (let [i, renderer] of this.noteRenderers.entries()) {
            let {x, y, w, h} = layout[i].notes;
            renderer.setRect(x, y, w, h);
        }

        for (let [i, renderer] of this.scoreRenderers.entries()) {
            let {x, y, w, h} = layout[i].score;
            renderer.setRect(x, y, w, h);
        }

        this._renderFrame(true);
    }

    prepareVideo() {
        this.videoElement = document.createElement('video');
        this.videoElement.style.position = 'absolute';
        this.videoElement.style.top = 0;
        this.videoElement.style.left = 0;
        this._updateVideoSize();
        this.videoElement.preload = "auto";
        this.videoElement.poster = this.song.background;
        this.videoElement.addEventListener("canplaythrough", () => {
            if (!this._ready) {
                this._ready = true;
                this.emit("ready");
            }
        });
        this.videoElement.addEventListener('error', () => {
            this.videoElement.removeAttribute('src');
            if (!this._ready) {
                this._ready = true;
                this.emit("ready");
            }
        });

        if (this.song.video) {
            let start = this.getVideoStartTime();
            // if (start > 0) {
            //     this.videoElement.addEventListener('loadedmetadata', () => {
            //         console.log('setting start time');
            //         this.videoElement.currentTime = start;
            //     });
            // }
            this.videoElement.src = `${this.song.video}#t=${start}`;
            console.log(this.videoElement.src);
        } else {
            setTimeout(() => {
                this._ready = true;
                this.emit("ready");
            }, 0);
        }
    }

    _updateVideoSize() {
        if (this.height > (this.width / 16*9)) {
            this.videoElement.height = this.height;
            this.videoElement.width = this.height / 9 * 16;
        } else {
            this.videoElement.height = this.width / 16 * 9;
            this.videoElement.width = this.width;
        }
        this.videoElement.style.top = `${(this.height - this.videoElement.height) / 2}px`;
        this.videoElement.style.left = `${(this.width - this.videoElement.width) / 2}px`;
    }

    get ready() {
        return this._ready;
    }

    title() {
        let titleRenderer = new TitleRenderer(this.canvasElement, this.song);
        this.videoElement.currentTime = 0;
        return new Promise((resolve) => {
            titleRenderer.render();
            setTimeout(() => {
                let start = Date.now();
                let fade = () => {
                    let opacity = 1 - ((Date.now() - start) / 33) * 0.05;
                    if (opacity > 0) {
                        titleRenderer.render(opacity);
                        requestAnimationFrame(fade);
                    }
                };
                setTimeout(() =>{
                    this.canvasElement.getContext('2d').clearRect(0, 0, this.canvasElement.clientWidth, this.canvasElement.clientHeight);
                    resolve();
                }, 667);
                requestAnimationFrame(fade);
            }, 3000);
        });
    }

    getVideoStartTime() {
        return this.song.videogap + (this.song.start || 0);
    }

    async start() {
        this.running = true;
        this.videoElement.currentTime = 0;
        let start = this.getVideoStartTime();
        if (this.videoElement.src) {
            if (start >= 0) {
                console.log("Video start time: ",start, this.videoElement.currentTime);
                // this.videoElement.currentTime = start;
                this._canKillVideo = false;
                await this.videoElement.play();
                this._canKillVideo = true;
            } else {
                console.log(`Delaying video playback by ${-start} seconds...`);
                this.videoElement.currentTime = 0;
                this._gapTimer = setTimeout(() => {console.log("video start."); this.videoElement.play()}, -start * 1000);
            }
        }
        this._scaleInterval = setInterval(() => this._scaleCanvas(), 1000);
        requestAnimationFrame(() => this._renderFrame());
    }

    stop() {
        clearInterval(this._scaleInterval);
        clearTimeout(this._gapTimer);
        this.videoElement.pause();
        this.running = false;
        this.container.style.overflow = 'unset';
        this.container.style.width = `unset`;
        this.container.style.height = `unset`;
    }

    _renderFrame(manual) {
        if (!this.running) {
            return;
        }
        if (this._canKillVideo && this.videoElement.src) {
            if (this.audio.currentTime >= Math.max(0, -this.song.videogap)) {
                if (Math.abs(this.videoElement.currentTime - this.audio.currentTime - this.song.videogap) > 0.2) {
                    console.log('A/V desync; disabling.', this.videoElement.currentTime, this.audio.currentTime, this.song.videogap);
                    this.videoElement.removeAttribute('src');
                    this.videoElement.load();
                    // If this line is omitted, Chrome just shows white. I don't know why.
                    this.videoElement.poster = this.videoElement.poster;
                }
            }
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
        if (!manual) {
            requestAnimationFrame(() => this._renderFrame());
        }
    }

    _scaleCanvas(force) {
        // assume the device pixel ratio is 1 if the browser doesn't specify it
        const devicePixelRatio = window.devicePixelRatio || 1;
        if (!force && this._currentCanvasScale === devicePixelRatio) {
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

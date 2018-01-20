import {LyricRenderer, NoteRenderer, ProgressRenderer, ScoreRenderer, TitleRenderer} from "./ultrastar/render";
import {Song} from "./ultrastar/parser";
import {EventEmitter} from "events";
import {Player} from "./player";
import {AudioPlayer} from "./game";

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export class GameDisplay extends EventEmitter {
    private song: Song;
    private container: HTMLElement;
    private width: number;
    private height: number;
    private players: Player[];
    private audio: AudioPlayer;
    private div: HTMLDivElement;
    private videoElement: HTMLVideoElement;
    private canvasElement: HTMLCanvasElement;
    private canvasContext: CanvasRenderingContext2D;
    private _currentCanvasScale: number;
    private progressRenderer: ProgressRenderer;
    private lyricRenderers: LyricRenderer[];
    private noteRenderers: NoteRenderer[];
    private scoreRenderers: ScoreRenderer[];
    private running: boolean;
    private _ready: boolean;
    private _scaleInterval: number;
    private _gapTimer: number;
    private _canKillVideo: boolean;

    constructor(container: HTMLElement, width: number, height: number, song: Song, players: Player[], audio: AudioPlayer) {
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
        this.canvasContext = null;
        this._currentCanvasScale = null;
        this.progressRenderer = null;
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

    on(event: 'ready', listener: () => void): this {
        return super.on(event, listener);
    }

    setSize(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.container.style.width = `${width}px`;
        this.container.style.height = `${height}px`;
        this._scaleCanvas(true);
        this._updateVideoSize();
        this.updateLayout();
    }

    createGameLayout(): void {
        console.log("players", this.players);
        this.canvasElement = document.createElement('canvas');
        this.canvasElement.style.position = 'absolute';
        this.canvasElement.style.top = '0';
        this.canvasElement.style.left = '0';
        this.canvasContext = this.canvasElement.getContext('2d');
        this._scaleCanvas();

        this.div = document.createElement('div');
        this.div.style.position = 'relative';

        this.div.appendChild(this.videoElement);
        this.div.appendChild(this.canvasElement);
        this.container.appendChild(this.div);

        this.progressRenderer = new ProgressRenderer(this.canvasElement, this.song, this.audio);

        let lyricColours = ['#4287f4', '#d70000'];

        for (let i = 0; i < this.song.parts.length; ++i) {
            let renderer = new LyricRenderer(this.canvasElement);
            renderer.activeColour = lyricColours[i];
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

    updateLayout(): void {
        const SCALE_W = 1280;
        const SCALE_H = 720;
        let cw = this.canvasElement.clientWidth;
        let ch = this.canvasElement.clientHeight;

        let d = (x: number, y: number, w: number, h: number) => ({x: x / SCALE_W * cw, y: y / SCALE_H * ch, w: w / SCALE_W * cw, h: h / SCALE_H * ch});

        const LYRICS = [d(0, 610, 1280, 90.999), d(0, 0, 1280, 90)];
        const LAYOUTS: {[index: number]: {notes: Rect, score: Rect}[]} = {
            1: [{notes: d(20, 340, 1240, 250), score: d(0, 280, 1260, 60)}],
            2: [{notes: d(20, 390, 1240, 220), score: d(0, 350, 1260, 40)},
                {notes: d(20, 130, 1240, 220), score: d(0, 90, 1260, 40)}],
            3: [{notes: d(20, 476, 1240, 133), score: d(0, 436, 1260, 40)},
                {notes: d(20, 303, 1240, 133), score: d(0, 263, 1260, 40)},
                {notes: d(20, 130, 1240, 133), score: d(0, 90, 1260, 40)}],
            4: [{notes: d(20, 130, 610, 220), score: d(0, 90, 610, 40)},
                {notes: d(650, 130, 610, 220), score: d(650, 90, 610, 40)},
                {notes: d(20, 390, 610, 220), score: d(0, 350, 610, 40)},
                {notes: d(650, 390, 610, 220), score: d(650, 350, 610, 40)}],
            5: [{notes: d(20, 476, 610, 133), score: d(0, 436, 610, 40)},
                {notes: d(20, 303, 610, 133), score: d(0, 263, 610, 40)},
                {notes: d(650, 303, 610, 133), score: d(650, 263, 610, 40)},
                {notes: d(20, 130, 610, 133), score: d(0, 90, 610, 40)},
                {notes: d(650, 130, 610, 133), score: d(650, 90, 610, 40)}],
            6: [{notes: d(20, 476, 610, 133), score: d(0, 436, 610, 40)},
                {notes: d(650, 476, 610, 133), score: d(650, 436, 610, 40)},
                {notes: d(20, 303, 610, 133), score: d(0, 263, 610, 40)},
                {notes: d(650, 303, 610, 133), score: d(650, 263, 610, 40)},
                {notes: d(20, 130, 610, 133), score: d(0, 90, 610, 40)},
                {notes: d(650, 130, 610, 133), score: d(650, 90, 610, 40)}],
        };

        this.canvasContext.clearRect(0, 0, cw, ch);

        let progressRect = d(0, 700, 1280, 20);
        this.progressRenderer.setRect(progressRect.x, progressRect.y, progressRect.w, progressRect.h);

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

    prepareVideo(): void {
        this.videoElement = document.createElement('video');
        this.videoElement.style.position = 'absolute';
        this.videoElement.style.top = '0';
        this.videoElement.style.left = '0';
        this._updateVideoSize();
        this.videoElement.muted = true; // Videos should never have an audio track, but some do; kill it.
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

    private _updateVideoSize(): void {
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

    get ready(): boolean {
        return this._ready;
    }

    title(): Promise<void> {
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
                setTimeout(() => {
                    this.canvasContext.clearRect(0, 0, this.canvasElement.clientWidth, this.canvasElement.clientHeight);
                    resolve();
                }, 667);
                requestAnimationFrame(fade);
            }, 3000);
        });
    }

    getVideoStartTime(): number {
        return this.song.videogap + (this.song.start || 0);
    }

    async start(): Promise<void> {
        this.running = true;
        this.videoElement.currentTime = 0;
        let start = this.getVideoStartTime();
        if (this.videoElement.src) {
            if (start >= 0) {
                console.log("Video start time: ",start, this.videoElement.currentTime);
                this.videoElement.currentTime = start;
                this._canKillVideo = false;
                try {
                    await this.videoElement.play();
                } catch(e) {
                    console.warn("Failed to start playing the video.");
                    console.warn(e);
                }
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

    stop(): void {
        clearInterval(this._scaleInterval);
        clearTimeout(this._gapTimer);
        this.videoElement.pause();
        this.running = false;
        this.container.style.overflow = 'unset';
        this.container.style.width = `unset`;
        this.container.style.height = `unset`;
    }

    private _renderFrame(manual?: boolean): void {
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

        // hide all our OOB rendering errors by clearing everything each frame.
        this.canvasContext.clearRect(0, 0, this.canvasElement.clientWidth,  this.canvasElement.clientHeight);

        this.progressRenderer.render(time);

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

    private _scaleCanvas(force?: boolean): void {
        // assume the device pixel ratio is 1 if the browser doesn't specify it
        const devicePixelRatio = window.devicePixelRatio || 1;
        if (!force && this._currentCanvasScale === devicePixelRatio) {
            return;
        }
        this._currentCanvasScale = devicePixelRatio;

        // determine the 'backing store ratio' of the canvas context
        let context = this.canvasContext;
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

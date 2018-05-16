import * as Colour from 'color';
import {Song, SongLine} from "./parser";
import {Player} from "../player";
import {AudioPlayer} from "../game";
import {Note} from "./parser";
import { SungNote } from '../audio/live';

const LYRIC_BACKGROUND_COLOUR = 'rgba(50, 50, 50, 0.8)';
const FONT = 'Ubuntu, sans-serif';

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export class LyricRenderer {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private rect: Rect;
    private song: Song;
    private part: number;
    activeColour: string;

    constructor(canvas: HTMLCanvasElement, x?: number, y?: number, w?: number, h?: number) {
        this.canvas = canvas;
        this.context = this.canvas.getContext('2d');
        this.rect = {x, y, w, h};
        this.song = null;
        this.part = 0;
        this.activeColour = '#4287f4';
    }

    setSong(song: Song, part: number): void {
        this.song = song;
        this.part = part || 0;
    }

    setRect(x: number, y: number, w: number, h: number): void {
        this.rect = {x, y, w, h};
    }

    render(time: number): void {
        let beat = this.song.msToBeats(time);
        let ctx = this.context;
        ctx.save();
        ctx.clearRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
        ctx.fillStyle = LYRIC_BACKGROUND_COLOUR;
        ctx.fillRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
        let line = this.song.getLine(time, this.part);
        if (!line) {
            return;
        }
        let startX = this._renderLyrics(line, beat, 0, this.rect.h * 0.5);
        let nextLine = this.song.getLineAtIndex(line.index + 1, this.part);
        if (nextLine) {
            this._renderLyrics(nextLine, beat, this.rect.h * 0.55, this.rect.h * 0.3);
        }
        this._renderStartIndicator(line, beat, this.rect.h * 0.5, startX);
        ctx.restore();
    }

    private _renderLyrics(line: SongLine, beat: number, y: number, size: number): number {
        let ctx = this.context;
        ctx.strokeStyle = 'black';
        ctx.fillStyle = 'white';
        ctx.textBaseline = 'top';
        ctx.lineWidth = 1.5;
        ctx.font = `${size}px ${FONT}`;
        let lineText = line.notes.map((x) => x.text).join('');
        let totalWidth = ctx.measureText(lineText).width;
        let availableWidth = this.rect.w * 0.9;
        let minX = (this.rect.w - availableWidth) / 2;
        let x = this.rect.x + (availableWidth/2 - totalWidth/2) + minX;
        let squashTextRatio = null;
        if (x < minX) {
            x = minX;
            squashTextRatio = availableWidth / totalWidth;
        }
        let startX = x;
        y = this.rect.y + y;
        for (let note of line.notes) {
            let active = (beat >= note.beat && beat < note.beat + note.length);
            ctx.save();
            if (active) {
                ctx.fillStyle = this.activeColour;
                ctx.strokeStyle = 'white';
            }
            if (note.type === 'F') {
                ctx.font = `italic ${ctx.font}`;
            }
            let expectedWidth = ctx.measureText(note.text).width;
            let maxWidth = undefined;
            if (squashTextRatio !== null) {
                maxWidth = expectedWidth * squashTextRatio;
            }
            ctx.fillText(note.text, x, y, maxWidth);
            if (active) {
                ctx.strokeText(note.text, x, y, maxWidth);
            }
            x += maxWidth || expectedWidth;
            ctx.restore();
        }
        return startX;
    }

    private _renderStartIndicator(line: SongLine, beat: number, height: number, width: number): void {
        const MIN_SILENT_SECONDS = 2;
        if (line.notes.length === 0) {
            return;
        }
        let firstBeat = line.notes[0].beat;
        let start = line.index === 0 ? this.song.msToBeats((this.song.start || 0) * 1000) : line.start;
        if (beat >= firstBeat || firstBeat - start < MIN_SILENT_SECONDS * 4 * this.song.bpm / 60) {
            return;
        }
        let ctx = this.context;
        ctx.save();
        ctx.fillStyle = this.activeColour;
        ctx.fillRect(this.rect.x + 5, this.rect.y + height * 0.15, Math.abs((width - 10) * (beat - start) / (firstBeat - start)), height * 0.8);
        ctx.restore();
    }
}

interface LineMetric {
    lowestNote: number;
    lineStartBeat: number;
    lineEndBeat: number;
}

const GOLDEN_NOTE_COLOUR = '#e0b61b';
const colour = new Colour(GOLDEN_NOTE_COLOUR);

const GOLDEN_NOTE_OUTLINE_COLOUR = colour.darken(0.1).fade(0.1).string();
const GOLDEN_NOTE_INNER_COLOUR = colour.lighten(0.3).desaturate(0.5).hex();
const GOLDEN_NOTE_SING_COLOUR = colour.lighten(0.4).hex();
const GOLDEN_NOTE_SING_OUTLINE_COLOUR = Colour(GOLDEN_NOTE_SING_COLOUR).darken(0.6).hex();

const EXPECTED_NOTE_INNER_RATIO = 0.7;
const BAD_NOTE_RATIO = 0.4;
const SUNG_NOTE_INNER_OFFSET = 0.1;

const AVAILABLE_LINES = 24;
const BASE_OFFSET = 4;
const SEMITONES_PER_OCTAVE = 12;

export class NoteRenderer {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private rect: Rect;
    private song: Song;
    private part: number;
    private player: Player;
    private outlineColour: string;
    private innerColour: string;
    private singColour: string;
    private singOutlineColour: string;
    private _lineMetrics: {[key: number]: LineMetric};

    constructor(canvas: HTMLCanvasElement, x?: number, y?: number, w?: number, h?: number) {
        this.canvas = canvas;
        this.context = this.canvas.getContext('2d');
        this.rect = {x, y, w, h};
        this.song = null;
        this.part = 0;
        this.player = null;
        this.outlineColour = null;
        this.innerColour = null;
        this.singColour = null;
        this.singOutlineColour = null;
        this._lineMetrics = {};
    }

    setSong(song: Song, part: number): void {
        this.song = song;
        this.part = part || 0;
    }

    setRect(x: number, y: number, w: number, h: number): void {
        this.rect = {x, y, w, h};
    }

    setPlayer(player: Player): void {
        this.player = player;
        let colour = new Colour(this.player.colour);
        this.outlineColour = colour.darken(0.1).fade(0.1).string();
        this.innerColour = colour.lighten(0.3).desaturate(0.5).hex();
        this.singColour = colour.lighten(0.4).hex();
        this.singOutlineColour = Colour(this.singColour).darken(0.6).hex();
    }

    private _getExpectedLine(line: SongLine, note: Note): number {
        const {lowestNote} = this.metricsForLine(line);
        let expectedLine = (note.pitch - lowestNote + BASE_OFFSET) % AVAILABLE_LINES;
        return expectedLine;
    }

    private _getSungLine(line: SongLine, expected: Note, actual: SungNote): number {
        let {lowestNote} = this.metricsForLine(line);
        lowestNote = ((lowestNote % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE;
        let actualNote = ((actual.note % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE;
        const expectedLine = this._getExpectedLine(line, expected);
        let renderLine = (((actualNote - lowestNote + BASE_OFFSET) % AVAILABLE_LINES) + AVAILABLE_LINES) % AVAILABLE_LINES;
        let altLine = (renderLine + SEMITONES_PER_OCTAVE) % AVAILABLE_LINES;
        if (altLine < 0) debugger;
        let finalLine: number;
        if (altLine === null || Math.abs(renderLine - expectedLine) < Math.abs(altLine - expectedLine)) {
            finalLine = renderLine;
        } else {
            finalLine = altLine;
        }
        let diffFromExpected = Math.min(Math.abs(finalLine - expectedLine), Math.abs(expectedLine - finalLine));
        if (expected.type !== 'F' && this._isSuccessfulNote(expected, actual)) {
            if (diffFromExpected > 1 && (diffFromExpected < 4 || diffFromExpected > 6)) {
                console.error("Successful result in the wrong place!?");
                debugger;
            }
            return expectedLine;
        } else {
            if (expected.type !== 'F' && actual.time >= expected.beat && actual.time < expected.beat + expected.length && diffFromExpected <= 1) {
                console.error("Unsuccessful result in successful bar!?");
                debugger;
            }
            return finalLine;
        }
    }

    private _isSuccessfulNote(expected: Note, actual: SungNote): boolean {
        let isOnNote = actual.time >= expected.beat && actual.time < expected.beat + expected.length;
        if (!isOnNote) {
            return false;
        }
        if (expected.type === 'F') {
            return true;
        }
        // Accept notes five semitones above the correct pitch to be valid, because sometimes we spuriously pick
        // these up instead. Harmonics!
        // TODO: This is also done in scoring; should centralise.
        return this._matches(expected.pitch, actual.note) || this._matches(expected.pitch, actual.note - 5);
    }

    private _matches(expected: number, actual: number): boolean {
        let expectedNote = ((expected % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE;
        let actualNote = ((actual % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE;
        let noteDiff = Math.abs(actualNote - expectedNote);
        return noteDiff <= 1 || noteDiff >= 11;
    }

    private _renderActual(line: SongLine, notes: SungNote[]) {
        let {lowestNote} = this.metricsForLine(line);

        let lastRenderLine: number = null;
        let lastStart: number = null;
        let lastEnd: number = null;
        let lastWasMatching : boolean = null;
        let lastActualStartBeat: number = null;
        let lastNote: Note = null;

        let doRender = () => {
            let lastWasGold = lastWasMatching && lastNote.type == '*';
            let ratio = lastWasMatching ? EXPECTED_NOTE_INNER_RATIO : BAD_NOTE_RATIO;
            this.renderLine(line, lastRenderLine, lastStart, lastEnd + 1, lastWasGold ? GOLDEN_NOTE_SING_COLOUR : this.singColour, lastWasGold ? GOLDEN_NOTE_SING_OUTLINE_COLOUR : this.singOutlineColour, ratio);
        }

        for (let note of notes) {
            let beat = note.time;
            let expected = line.getNoteNearBeat(beat);
            let renderLine = this._getSungLine(line, expected, note);
            let matchingNote = this._isSuccessfulNote(expected, note);

            if (renderLine === lastRenderLine && lastWasMatching === matchingNote && beat === lastEnd + 1 && lastActualStartBeat === expected.beat) {
                lastEnd = beat;
                continue;
            }
            // now we have to render the *previous* note
            if (lastNote) {
                doRender();
            }
            
            // Update what 'previous' means.
            lastStart = beat;
            lastEnd = beat;
            lastRenderLine = renderLine;
            lastWasMatching = matchingNote;
            lastActualStartBeat = expected.beat;
            lastNote = expected;
        }
        if (lastRenderLine !== null) {
            doRender();
        }
    }

    private _renderExpected(line: SongLine): void {
        let {lowestNote} = this.metricsForLine(line);
        for (let note of line.notes) {
            if (note.type === 'F') {
                this.renderFreestyle(line, note.beat, note.beat + note.length);
            } else {
                let renderLine = this._getExpectedLine(line, note);
                let isGold = note.type == '*';
                this.renderLine(line, renderLine, note.beat, note.beat + note.length, isGold ? GOLDEN_NOTE_INNER_COLOUR : this.innerColour, isGold ? GOLDEN_NOTE_OUTLINE_COLOUR : this.outlineColour, 1);
            }
        }
    }

    render(time: number): void {
        let ctx = this.context;
        ctx.clearRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#333333';
        ctx.lineCap = 'butt';
        for (let i = 0; i < 12; ++i) {
            ctx.beginPath();
            let y = this.rect.y + (this.rect.h - ((i+0.5) * (this.rect.h / 13.5))) - this.rect.h / 27;
            ctx.moveTo(this.rect.x, y);
            ctx.lineTo(this.rect.x + this.rect.w, y);
            ctx.stroke();
        }
        ctx.restore();

        let line = this.song.getLine(time, this.player.part);
        if (!line) {
            return;
        }
        let startBeat = line.notes[0].beat;
        let endBeat = line.notes[line.notes.length - 1].beat + line.notes[line.notes.length - 1].length;

        this._renderExpected(line);

        if (this.player) {
            this._renderActual(line, this.player.notesInRange(startBeat, endBeat));
        }
    }

    private metricsForLine(line: SongLine): LineMetric {
        if (!line.notes.length) {
            return {lowestNote: 0, lineEndBeat: 0, lineStartBeat: 0};
        }
        if (!this._lineMetrics[line.notes[0].beat]) {
            let lowestNote = line.notes.reduce((min, note) => note.type !== 'F' && note.pitch < min ? note.pitch : min, Infinity);
            if (lowestNote == Infinity) {
                lowestNote = 0;
            }
            let lineStartBeat = line.notes[0].beat;
            let lineEndBeat = line.notes[line.notes.length - 1].beat + line.notes[line.notes.length - 1].length;
            this._lineMetrics[lineStartBeat] = {lowestNote, lineStartBeat, lineEndBeat};
        }
        return this._lineMetrics[line.notes[0].beat];
    }

    private renderLine(songLine: SongLine, renderLine: number, startBeat: number, endBeat: number, colourInner: string, colourOuter: string, scale: number) {
        let thickness = this.rect.h / 8.8;
        let {lineStartBeat, lineEndBeat} = this.metricsForLine(songLine);
        let ctx = this.context;
        ctx.save();
        ctx.lineCap = 'butt';

        thickness *= scale;
        ctx.fillStyle = colourInner;
        ctx.strokeStyle = colourOuter;
        ctx.lineWidth = thickness * 0.1;
        let w = this.rect.w * 0.95;
        let beatWidth = w / (lineEndBeat - lineStartBeat);
        let x = this.rect.h/7;
        let y = this.rect.y + (this.rect.h - ((renderLine + 1) * (this.rect.h / 27))) - this.rect.h / 27;
        let cap = 0;

        ctx.beginPath();
        let x1 = this.rect.x + x + cap / scale + beatWidth * (startBeat - lineStartBeat);
        let x2 = this.rect.x + x - cap / scale + beatWidth * (endBeat - lineStartBeat);
        ctx.fillRect(x1, y - thickness/2, x2 - x1, thickness);
        ctx.strokeRect(x1, y - thickness/2, x2 - x1, thickness);
        ctx.stroke();
        ctx.restore();
    }

    private renderFreestyle(songLine: SongLine, startBeat: number, endBeat: number): void {
        let {lineStartBeat, lineEndBeat} = this.metricsForLine(songLine);
        let w = this.rect.w * 0.95;
        let beatWidth = w / (lineEndBeat - lineStartBeat);
        let x = this.rect.h/7;
        let y = this.rect.y + 3 * (this.rect.h / 27);
        let x1 = this.rect.x + x + beatWidth * (startBeat - lineStartBeat);
        let x2 = this.rect.x + x + beatWidth * (endBeat - lineStartBeat);

        let ctx = this.context;
        ctx.save();
        ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
        ctx.fillRect(x1, y, x2 - x1, this.rect.h - 5 * (this.rect.h / 27));
        ctx.restore();
    }
}

export class ScoreRenderer {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private rect: Rect;
    private player: Player;

    constructor(canvas: HTMLCanvasElement, x?: number, y?: number, w?: number, h?: number) {
        this.canvas = canvas;
        this.context = this.canvas.getContext('2d');
        this.rect = {x, y, w, h};
        this.player = null;
    }

    setRect(x: number, y: number, w: number, h: number): void {
        this.rect = {x, y, w, h};
    }

    setPlayer(player: Player): void {
        this.player = player;
    }

    render(): void {
        let ctx = this.canvas.getContext('2d');
        ctx.save();
        ctx.font = `${this.rect.h/1}px ${FONT}`;
        ctx.strokeStyle = 'white';
        ctx.fillStyle = this.player.colour;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'right';
        let y = this.rect.y;
        if (window.chrome) {
            y -= this.rect.h / 11;
        }
        ctx.clearRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
        let text = `${this.player.nick}: ${this.player.score}`;
        ctx.fillText(text, this.rect.x+this.rect.w, y, this.rect.w);
        ctx.strokeText(text, this.rect.x+this.rect.w, y, this.rect.w);
        ctx.restore();
    }
}

export class TitleRenderer {
    private canvas: HTMLCanvasElement;
    private song: Song;
    private context: CanvasRenderingContext2D;
    private rect: {w: number, h: number};

    constructor(canvas: HTMLCanvasElement, song: Song) {
        this.canvas = canvas;
        this.song = song;
        this.context = this.canvas.getContext('2d');
        this.rect = {w: canvas.clientWidth, h: canvas.clientHeight};
    }

    render(opacity?: number): void {
        let ctx = this.context;
        ctx.clearRect(0, 0, this.rect.w, this.rect.h);
        ctx.save();
        ctx.globalAlpha = opacity || 1;
        ctx.fillStyle = 'rgba(30, 30, 30, 0.7)';
        ctx.fillRect(0, 0, this.rect.w, this.rect.h);
        ctx.strokeStyle = 'black';
        ctx.fillStyle = 'white';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        ctx.font = `${this.rect.h/9}px ${FONT}`;
        ctx.fillText(this.song.metadata.title, this.rect.w / 2, 0.2638888889 * this.rect.h, this.rect.w);
        ctx.font = `${this.rect.h*0.07638888889}px ${FONT}`;
        ctx.fillText(this.song.metadata.artist, this.rect.w / 2, 0.4166666667 * this.rect.h, this.rect.w);
        ctx.font = `${this.rect.h/18}px ${FONT}`;
        if (this.song.metadata.creator) {
            ctx.fillText(`Transcribed by ${this.song.metadata.creator}`, this.rect.w / 2, 0.61111 * this.rect.h, this.rect.w);
        }
        if (this.song.metadata.comment && this.song.metadata.comment.includes('mylittlekaraoke')) {
            ctx.fillText("Originally created for My Little Karaoke", this.rect.w / 2, 0.6944444444 * this.rect.h, this.rect.w);
        }
        ctx.restore();
    }
}

export class ProgressRenderer {
    private canvas: HTMLCanvasElement;
    private song: Song;
    private audio: AudioPlayer;
    private rect: Rect;
    private context: CanvasRenderingContext2D;
    private offscreenCanvas: HTMLCanvasElement;
    private offscreenContext: CanvasRenderingContext2D;

    constructor(canvas: HTMLCanvasElement, song: Song, audio: AudioPlayer, x?: number, y?: number, w?: number, h?: number) {
        this.canvas = canvas;
        this.song = song;
        this.audio = audio;
        this.rect = {x, y, w, h};
        this.context = this.canvas.getContext('2d');
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenContext = this.offscreenCanvas.getContext('2d');
    }

    render(time: number): void {
        this.context.save();
        this.context.clearRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
        this.context.fillStyle = LYRIC_BACKGROUND_COLOUR;
        this.context.fillRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
        // blit the pre-rendered summary view on.
        this.context.drawImage(this.offscreenCanvas, this.rect.x, this.rect.y);
        this.context.fillStyle = 'white';
        this.context.fillRect(this.rect.x, this.rect.y, this.rect.w * (((time / 1000) - (this.song.start || 0)) / (this.audio.duration)), this.rect.h);
        this.context.restore();
    }

    setRect(x: number, y: number, w: number, h: number): void {
        this.rect = {x, y, w, h};
        this._renderSummary();
    }

    _renderSummary(): void {
        let h = this.offscreenCanvas.height = this.rect.h;
        let w = this.offscreenCanvas.width = this.rect.w;
        let ctx = this.offscreenContext;
        ctx.clearRect(0, 0, w, h);
        let parts = <[number, string][]>[[0, '#4287f4'], [1, '#d70000']];
        let startBeat = this.song.msToBeats((this.song.start || 0) * 1000);
        let pixelsPerBeat = w / (this.song.msToBeats((this.audio.duration + (this.song.start || 0)) * 1000) - startBeat);
        ctx.globalCompositeOperation = 'lighter';
        for (let [partNum, colour] of parts) {
            if (!this.song.parts[partNum]) {
                break;
            }
            ctx.fillStyle = <string>colour;
            for (let line of this.song.parts[partNum]) {
                for (let note of line.notes) {
                    ctx.fillRect((note.beat - startBeat) * pixelsPerBeat, 0, note.length * pixelsPerBeat, h);
                }
            }
        }
    }
}

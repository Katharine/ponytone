"use strict";

export interface SongMetadata {
    title?: string;
    cover?: string;
    artist?: string;
    creator?: string;
    edition?: string;
    language?: string;
    genre?: string;
    updated?: string;
    comment?: string;
}

type NoteType = '#' | 'P' | ':' | '*' | 'F' | '-' | 'E';

export interface Note {
    type: NoteType;
    beat: number;
    pitch: number;
    length: number;
    text: string;
}

export interface NoteLine {
    notes: Note[];
    start: number;
    end?: number;
}

type Part = NoteLine[];

export class Song {
    baseURL: string;
    metadata: SongMetadata;
    bpm: number;
    gap: number;
    start: number;
    end: number;
    videogap: number;
    parts: Part[];

    private _mp3: string;
    private _background: string;
    private _video: string;


    constructor(baseURL: string, text: string) {
        this.baseURL = baseURL;
        this.metadata = {};
        this.parts = [];
        this.bpm = null;
        this.gap = null;
        this.start = null;
        this.end = null;
        this._mp3 = null;
        this._background = null;
        this._video = null;
        this.videogap = 0;
        this.parse(text);
    }

    getLine(time: number, part?: number): SongLine {
        part = part || 0;
        let beat = this.msToBeats(time);
        if (beat < 0) {
            beat = 0;
        }
        for (let i = 0; i < this.parts[part].length - 1; ++i) {
            if(beat >= this.parts[part][i].start && this.parts[part][i+1].start > beat) {
                if (this.parts[part][i].end && this.parts[part][i].end > beat) {
                    return null;
                }
                return new SongLine(this, i, this.parts[part][i]);
            }
        }
        let lastLineIndex = this.parts[part].length - 1;
        let lastLine = this.parts[part][lastLineIndex];
        if (beat >= lastLine.start) {
            if (!lastLine.end || lastLine.end > beat) {
                return new SongLine(this, lastLineIndex, lastLine);
            }
        }
        return null;
    }

    getLineAtIndex(index: number, part?: number): SongLine {
        let line = this.parts[part || 0][index];
        if (!line) {
            return null;
        }
        return new SongLine(this, index, line);
    }

    msToBeats(time: number): number {
        return Math.floor((((time - this.gap) / 60000) * this.bpm) * 4);
    }

    parse(text: string): void {
        let lines: string[] = text.replace(/\r/g, "") .split("\n");
        let part: Part = [];
        let noteLine: NoteLine = {notes: [], start: 0};
        for (let line of lines) {
            if (line.length === 0) {
                continue;
            }
            let type = line[0];
            switch (type) {
                case "#":
                    this._parseCommand(line);
                    break;
                case "P":
                    if (part.length > 0) {
                        if (noteLine.notes.length > 0) {
                            part.push(noteLine)
                        }
                        if (part.length > 0) {
                            this.parts.push(part);
                        }
                        noteLine = {notes: [], start: 0};
                        part = [];
                    }
                    break;
                case ":":
                case "*":
                case "F":
                    noteLine.notes.push(this._parseNote(line));
                    break;
                case "-":
                    part.push(noteLine);
                    noteLine = this._parseNewLine(line);
                    break;
                case "E":
                    part.push(noteLine);
                    this.parts.push(part);
            }
        }
    }

    _parseNote(line: string): Note {
        let content = line.split(' ', 4);
        let type = content[0];
        let [beat, length, pitch] = content.slice(1).map((x) => parseInt(x, 10));
        let text = line.substr(content.join(' ').length + 1);
        return {type: <NoteType>type, beat, length, pitch, text}
    }

    _parseNewLine(line: string): NoteLine {
        let [, start, end] = line.split(' ').map((x) => parseInt(x, 10));
        let ret: NoteLine = {start, notes: []};
        if (end) {
            ret.end = end;
        }
        return ret;
    }

    _parseCommand(line: string): void {
        let [command] = line.substr(1).split(":", 1);
        let value = line.substr(command.length + 2);
        switch (command.toUpperCase()) {
            case "TITLE":
                this.metadata.title = value;
                break;
            case "ARTIST":
                this.metadata.artist = value;
                break;
            case "CREATOR":
                this.metadata.creator = value;
                break;
            case "EDITION":
                this.metadata.edition = value;
                break;
            case "LANGUAGE":
                this.metadata.language = value;
                break;
            case "GENRE":
                this.metadata.genre = value;
                break;
            case "UPDATED":
                this.metadata.updated = value;
                break;
            case "COMMENT":
                this.metadata.comment = value;
                break;
            case "MP3":
                this._mp3 = value;
                break;
            case "COVER":
                this.metadata.cover = value;
                break;
            case "BACKGROUND":
                this._background = value;
                break;
            case "BPM":
                this.bpm = parseFloat(value.replace(',', '.'));
                break;
            case "GAP":
                this.gap = parseInt(value, 10);
                break;
            case "VIDEO":
                this._video = value;
                break;
            case "VIDEOGAP":
                this.videogap = parseFloat(value.replace(',', '.'));
                break;
            case "START":
                this.start = parseFloat(value.replace(',', '.'));
                break;
            case "END":
                this.end = parseInt(value, 10);
                break;
            default:
                console.warn(`Got unknown command ${command}; ignoring.`)
        }
    }

    get mp3(): string {
        return this.baseURL + '/' + this._mp3;
    }

    get background(): string {
        return this.baseURL + '/' + this._background;
    }

    get video(): string {
        return this._video ? this.baseURL + '/' + this._video : null;
    }
}

export class SongLine {
    song: Song;
    index: number;
    line: NoteLine;

    constructor(song: Song, index: number, line: NoteLine) {
        this.song = song;
        this.index = index;
        this.line = line;
    }

    getNote(time: number): Note {
        let beats = this.song.msToBeats(time);

        for (let note of this.line.notes) {
            if (beats >= note.beat && beats < note.beat + note.length) {
                return note;
            }
        }
        return null;
    }

    getNoteNearBeat(beat: number): Note {
        for (let i = this.line.notes.length - 1; i >= 0; --i) {
            let note = this.line.notes[i];
            if (beat >= note.beat) {
                return note;
            }
        }
        return null;
    }

    get notes(): Note[] {
        return this.line.notes;
    }

    get start(): number {
        return this.line.start;
    }

    get end(): number {
        return this.line.end || null;
    }
}

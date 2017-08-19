"use strict";

export class Song {
    constructor(baseURL, text) {
        this.baseURL = baseURL;
        this.metadata = {};
        this.parts = [];
        this.bpm = null;
        this.gap = null;
        this._mp3 = null;
        this._background = null;
        this._video = null;
        this.parse(text);
    }

    getLine(time, part) {
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
                return new SongLine(this, this.parts[part][i]);
            }
        }
        let lastLine = this.parts[part][this.parts[part].length - 1];
        if (beat >= lastLine.start) {
            if (!lastLine.end || lastLine.end > beat) {
                return new SongLine(this, lastLine);
            }
        }
        return null;
    }

    msToBeats(time) {
        return Math.floor((((time - this.gap) / 60000) * this.bpm) * 4);
    }

    parse(text) {
        let lines = text.replace(/\r/g, "").split("\n");
        let part = [];
        let noteLine = {notes: [], start: 0};
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

    _parseNote(line) {
        let content = line.split(' ', 4);
        let type = content[0];
        let [beat, length, pitch] = content.slice(1).map((x) => parseInt(x, 10));
        let text = line.substr(content.join(' ').length + 1);
        return {type, beat, length, pitch, text}
    }

    _parseNewLine(line) {
        let [, start, end] = line.split(' ').map((x) => parseInt(x, 10));
        let ret = {start, notes: []};
        if (end) {
            ret.end = end;
        }
        return ret;
    }

    _parseCommand(line) {
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
                this.bpm = parseFloat(value, 10);
                break;
            case "GAP":
                this.gap = parseInt(value, 10);
                break;
            case "VIDEO":
                this._video = value;
                break;
            default:
                console.warn(`Got unknown command ${command}; ignoring.`)
        }
    }

    get mp3() {
        return this.baseURL + '/' + this._mp3;
    }

    get background() {
        return this.baseURL + '/' + this._background;
    }

    get video() {
        return this.baseURL + '/' + this._video;
    }
}

export class SongLine {
    constructor(song, line) {
        this.song = song;
        this.line = line;
    }

    getNote(time) {
        let beats = this.song.msToBeats(time);

        for (let note of this.line.notes) {
            if (beats >= note.beat && beats < note.beat + note.length) {
                return note;
            }
        }
        return null;
    }

    getNoteNearBeat(beat) {
        for (let i = this.line.notes.length - 1; i >= 0; --i) {
            let note = this.line.notes[i];
            if (beat >= note.beat) {
                return note;
            }
        }
        return null;
    }

    get notes() {
        return this.line.notes;
    }

    get start() {
        return this.line.start;
    }

    get end() {
        return this.line.end || null;
    }
}

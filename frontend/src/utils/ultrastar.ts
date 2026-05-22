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

export type NoteType = '#' | 'P' | ':' | '*' | 'F' | '-' | 'E';

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

export type Part = NoteLine[];

export class Song {
  baseURL: string;
  metadata: SongMetadata;
  bpm: number;
  gap: number;
  start: number | null;
  end: number | null;
  videogap: number;
  parts: Part[];

  private _mp3: string | null;
  private _background: string | null;
  private _video: string | null;

  constructor(baseURL: string, text: string) {
    this.baseURL = baseURL;
    this.metadata = {};
    this.parts = [];
    this.bpm = 0;
    this.gap = 0;
    this.start = null;
    this.end = null;
    this._mp3 = null;
    this._background = null;
    this._video = null;
    this.videogap = 0;
    this.parse(text);
  }

  getLine(time: number, partIndex = 0): SongLine | null {
    if (!this.parts[partIndex] || this.parts[partIndex].length === 0) {
      return null;
    }
    let beat = this.msToBeats(time);
    if (beat < 0) {
      beat = 0;
    }
    const part = this.parts[partIndex];
    for (let i = 0; i < part.length - 1; ++i) {
      if (beat >= part[i].start && part[i + 1].start > beat) {
        if (part[i].end && beat >= part[i].end!) {
          return null;
        }
        return new SongLine(this, i, part[i]);
      }
    }
    const lastLineIndex = part.length - 1;
    const lastLine = part[lastLineIndex];
    if (beat >= lastLine.start) {
      if (!lastLine.end || lastLine.end > beat) {
        return new SongLine(this, lastLineIndex, lastLine);
      }
    }
    return null;
  }

  getLineAtIndex(index: number, partIndex = 0): SongLine | null {
    const part = this.parts[partIndex];
    if (!part || !part[index]) {
      return null;
    }
    return new SongLine(this, index, part[index]);
  }

  msToBeats(time: number): number {
    return Math.floor((((time - this.gap) / 60000) * this.bpm) * 4);
  }

  beatsToMs(beat: number): number {
    return ((beat / 4) / this.bpm) * 60000 + this.gap;
  }

  parse(text: string): void {
    const lines = text.replace(/\r/g, "").split("\n");
    let part: Part = [];
    let noteLine: NoteLine = { notes: [], start: 0 };
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }
      const type = trimmed[0];
      switch (type) {
        case "#":
          this._parseCommand(trimmed);
          break;
        case "P":
          if (part.length > 0 || noteLine.notes.length > 0) {
            if (noteLine.notes.length > 0) {
              part.push(noteLine);
            }
            if (part.length > 0) {
              this.parts.push(part);
            }
            noteLine = { notes: [], start: 0 };
            part = [];
          }
          break;
        case ":":
        case "*":
        case "F":
          noteLine.notes.push(this._parseNote(trimmed));
          break;
        case "-":
          part.push(noteLine);
          noteLine = this._parseNewLine(trimmed);
          break;
        case "E":
          part.push(noteLine);
          this.parts.push(part);
          noteLine = { notes: [], start: 0 };
          part = [];
          break;
      }
    }
  }

  _parseNote(line: string): Note {
    const content = line.split(' ', 4);
    const type = content[0];
    const [beat, length, pitch] = content.slice(1).map((x) => parseInt(x, 10));
    const text = line.substring(content.join(' ').length + 1);
    return { type: type as NoteType, beat, length, pitch, text };
  }

  _parseNewLine(line: string): NoteLine {
    const parts = line.split(' ').map((x) => parseInt(x, 10));
    // Line format: - beat [end_beat]
    const start = parts[1] || 0;
    const end = parts[2];
    const ret: NoteLine = { start, notes: [] };
    if (end) {
      ret.end = end;
    }
    return ret;
  }

  _parseCommand(line: string): void {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) return;
    const command = line.substring(1, colonIdx).trim().toUpperCase();
    const value = line.substring(colonIdx + 1).trim();
    switch (command) {
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
        console.warn(`Got unknown command ${command}; ignoring.`);
    }
  }

  get mp3(): string | null {
    return this._mp3 ? this.baseURL + '/' + this._mp3 : null;
  }

  get background(): string | null {
    return this._background ? this.baseURL + '/' + this._background : null;
  }

  get video(): string | null {
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

  getNote(time: number): Note | null {
    const beats = this.song.msToBeats(time);
    for (const note of this.line.notes) {
      if (beats >= note.beat && beats < note.beat + note.length) {
        return note;
      }
    }
    return null;
  }

  getNoteNearBeat(beat: number): Note | null {
    for (let i = this.line.notes.length - 1; i >= 0; --i) {
      const note = this.line.notes[i];
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

  get end(): number | null {
    return this.line.end || null;
  }
}

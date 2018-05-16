import {Singing, AudioTrack, SungNote} from "./audio/live";
import {Song} from "./ultrastar/parser";

export interface Player {
    readonly nick: string;
    readonly colour: string;
    readonly score: number;
    readonly part: number;

    start(): void;
    stop(): void;
    notesInRange(start: number, end: number): SungNote[];
}

export class LocalPlayer implements Player {
    nick: string;
    colour: string;
    song: Song;
    part: number;
    singing: Singing = null;
    audio: AudioTrack;
    private _scorePerBeat: number = null;

    constructor(nick: string, colour: string, song: Song, part: number, audio: AudioTrack) {
        this.nick = nick;
        this.colour = colour;
        this.song = song;
        this.part = part;
        this.audio = audio;
    }

    setSong(song: Song): void {
        this.song = song;
    }

    prepare(): void {
        this.singing = new Singing(this.song, this.audio);
    }

    start(): void {
        this.singing.start();
    }

    stop(): void {
        this.singing.stop();
    }

    notesInRange(start: number, end: number): SungNote[] {
        return this.singing.notesInRange(start, end);
    }

    private get scorePerBeat(): number {
        if (this._scorePerBeat === null) {
            let part = this.song.parts[this.part];
            let expected = part.map((x) => x.notes).reduce((a, c) => a.concat(c), []);
            let actual = this.singing.notes;
            let i = 0;
            let totalBeats = expected.filter((x) => x.type !== 'F').reduce((a, v) => a + (v.type == '*' ? 2 : 1) * v.length, 0);
            this._scorePerBeat = 10000 / totalBeats;
        }
        return this._scorePerBeat;
    }

    get score(): number {
        let part = this.song.parts[this.part];
        let expected = part.map((x) => x.notes).reduce((a, c) => a.concat(c), []);
        let actual = this.singing.notes;
        let i = 0;
        let scorePerBeat = this.scorePerBeat;
        let score = 0;
        for(let note of expected) {
            if (note.type === 'F') {
                continue;
            }
            while (actual[i] && actual[i].time < note.beat) ++i;
            while (actual[i] && actual[i].time < note.beat + note.length) {
                if (!actual[i]) {
                    break;
                }
                // Score notes five semitones too high as if they were correct.
                // TODO: This is also done in rendering; should centralise.
                if (this.matches(actual[i].note, note.pitch) || this.matches(actual[i].note, note.pitch - 5)) {
                    score += scorePerBeat * (note.type == '*' ? 2 : 1);
                }
                ++i;
            }
        }
        return Math.round(score);
    }

    private matches(actual: number, detected: number) {
        const diff = Math.abs((actual % 12) - (detected % 12));
        return (diff <= 1 || diff >= 11);
    }
}

export class RemotePlayer implements Player {
    nick: string;
    colour: string;
    score: number;
    notes: SungNote[];
    part: number;

    constructor(nick: string, colour: string, part: number) {
        this.nick = nick;
        this.colour = colour;
        this.score = 0;
        this.notes = [];
        this.part = part || 0;
    }

    start(): void {

    }

    stop(): void {

    }

    addNotes(notes: SungNote[]): void {
        this.notes.push(...notes);
    }

    notesInRange(start: number, end: number): SungNote[] {
        return this.notes.filter((x) => start <= x.time && x.time < end);
    }
}

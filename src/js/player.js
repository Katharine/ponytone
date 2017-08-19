"use strict";
import {Singing} from "./audio/live";

export class LocalPlayer {
    constructor(song, part, audio) {
        this.song = song;
        this.part = part;
        this.singing = null;
        this.audio = audio;
    }

    setSong(song) {
        this.song = song;
    }

    prepare() {
        this.singing = new Singing(this.song, this.audio);
    }

    start() {
        this.singing.start();
    }

    get score() {
        let part = this.song.parts[this.part];
        let expected = part.map((x) => x.notes).reduce((a, c) => a.concat(c), []);
        // console.log(expected);
        let actual = this.singing.notes;
        let i = 0;
        let lastNote = expected[expected.length - 1];
        let scorePerBeat = 10000 / (lastNote.beat + lastNote.length);
        let score = 0;
        for(let note of expected) {
            while (actual[i] && actual[i].time < note.beat) ++i;
            while (actual[i] && actual[i].time < note.beat + note.length) {
                if (!actual[i]) {
                    break;
                }
                if (actual[i].note % 12 === note.pitch % 12) {
                    score += scorePerBeat;
                }
                ++i;
            }
        }
        // console.log(i);
        return Math.round(score);
    }
}

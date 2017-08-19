export class LyricRenderer {
    constructor(canvas, x, y, w, h) {
        this.canvas = canvas;
        this.context = this.canvas.getContext('2d');
        this.rect = {x, y, w, h};
        this.song = null;
        this.part = 0;
        this.activeColour = '#4287f4';
    }

    setSong(song, part) {
        this.song = song;
        this.part = part || 0;
    }

    setActiveColour(colour) {
        this.activeColour = colour;
    }

    render(time) {
        let beat = this.song.msToBeats(time);
        let ctx = this.context;
        ctx.save();
        ctx.font = '48px sans-serif';
        ctx.strokeStyle = 'black';
        ctx.fillStyle = 'white';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 1.5;
        ctx.clearRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
        let line = this.song.getLine(time, this.part);
        if (!line) {
            return;
        }
        let lineText = line.notes.map((x) => x.text).join('');
        let totalWidth = ctx.measureText(lineText).width;
        let x = this.rect.x + (this.rect.w/2 - totalWidth/2);
        let y = this.rect.y + this.rect.h/2;
        for (let note of line.notes) {
            let active = (beat >= note.beat && beat < note.beat + note.length);
            if (active) {
                ctx.save();
                ctx.fillStyle = this.activeColour;
                ctx.strokeStyle = 'white';
            }
            if (note.type === 'F') {
                ctx.save();
                ctx.font = `italic ${ctx.font}`;
            }
            ctx.fillText(note.text, x, y);
            ctx.strokeText(note.text, x, y);
            x += ctx.measureText(note.text).width;
            if (note.type === 'F') {
                ctx.restore();
            }
            if (active) {
                ctx.restore();
            }
        }
        ctx.restore();
    }
}

export class NoteRenderer {
    constructor(canvas, x, y, w, h) {
        this.canvas = canvas;
        this.context = this.canvas.getContext('2d');
        this.rect = {x, y, w, h};
        this.song = null;
        this.part = 0;
        this.colour = '#4287f4';
        this.singer = null;
    }

    setSinger(singer) {
        this.singer = singer;
    }

    setSong(song, part) {
        this.song = song;
        this.part = part || 0;
    }

    setColour(colour) {
        this.colour = colour;
    }

    addSungNote(time, pitch) {
        this.sung.push({time, pitch});
    }

    render(time) {
        let ctx = this.context;
        ctx.clearRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#333333';
        ctx.lineCap = 'butt';
        for (let i = 0; i < 10; ++i) {
            ctx.beginPath();
            let y = this.rect.y + (this.rect.h - (i * (this.rect.h / 10))) - this.rect.h / 20;
            ctx.moveTo(this.rect.x, y);
            ctx.lineTo(this.rect.x + this.rect.w, y);
            ctx.stroke();
        }
        ctx.restore();

        let line = this.song.getLine(time, this.part);
        if (!line) {
            return;
        }
        let startBeat = line.notes[0].beat;
        let endBeat = line.notes[line.notes.length - 1].beat + line.notes[line.notes.length - 1].length;
        if (startBeat === endBeat) {
            return;
        }

        ctx.save();
        let beatWidth = this.rect.w / (endBeat - startBeat);
        let lowest = line.notes.reduce((min, note) => note.pitch < min ? note.pitch : min, Infinity);
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        ctx.strokeStyle = this.colour;
        for (let note of line.notes) {
            if (note.type === 'F') {
                continue;
            }
            let line = (note.pitch - lowest + 4) % 20;
            let y = this.rect.y + (this.rect.h - (line * (this.rect.h / 20))) - this.rect.h / 20;

            ctx.beginPath();
            ctx.moveTo(this.rect.x + 10 + beatWidth * (note.beat - startBeat), y);
            ctx.lineTo(this.rect.x - 10 + beatWidth * (note.beat - startBeat + note.length), y);
            ctx.stroke();
        }
        this.context.restore();

        if (this.singer) {
            ctx.save();
            ctx.lineWidth = 10;
            ctx.lineCap = 'butt';
            ctx.strokeStyle = 'black';
            for (let note of this.singer.notesInRange(startBeat, endBeat)) {
                let beat = note.time;
                let actual = line.getNoteNearBeat(beat);
                let renderLine = (note.note - lowest + 4) % 20;
                let altLine = (note.note - lowest + 4 + 12) % 20;
                let actualLine = (actual.pitch - lowest + 4) % 20;
                while (renderLine < 0) renderLine += 19;
                while (altLine < 0) altLine += 19;
                if (Math.abs(altLine - actualLine) < Math.abs(renderLine - actualLine)) {
                    renderLine = altLine;
                }
                let y = this.rect.y + (this.rect.h - (renderLine * (this.rect.h / 20))) - this.rect.h / 20;

                ctx.beginPath();
                ctx.moveTo(this.rect.x + beatWidth * (beat - startBeat), y);
                ctx.lineTo(this.rect.x + beatWidth * (beat - startBeat + 1), y);
                ctx.stroke();
            }
            ctx.restore();
        }
    }
}

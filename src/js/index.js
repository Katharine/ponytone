import {Singing} from "./audio/live";
import {LyricRenderer, NoteRenderer} from "./ultrastar/render";
import {Song} from "./ultrastar/parser";

import txt from "../media/notes.txt";

window.Song = Song;

let song = new Song(txt.replace(/\r/g, ""));

window.something = song;

let oldScale = 1;
function scaleCanvas(canvas, context, width, height) {
    // assume the device pixel ratio is 1 if the browser doesn't specify it
    const devicePixelRatio = window.devicePixelRatio || 1;
    if (devicePixelRatio === oldScale) {
        return;
    }
    oldScale = devicePixelRatio;

    // determine the 'backing store ratio' of the canvas context
    const backingStoreRatio = (
        context.webkitBackingStorePixelRatio ||
        context.mozBackingStorePixelRatio ||
        context.msBackingStorePixelRatio ||
        context.oBackingStorePixelRatio ||
        context.backingStorePixelRatio || 1
    );

    // determine the actual ratio we want to draw at
    const ratio = devicePixelRatio / backingStoreRatio;

    if (devicePixelRatio !== backingStoreRatio) {
        // set the 'real' canvas size to the higher width/height
        canvas.width = width * ratio;
        canvas.height = height * ratio;

        // ...then scale it back down with CSS
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
    }
    else {
        // this is a normal 1:1 device; just scale it simply
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = '';
        canvas.style.height = '';
    }

    // scale the drawing context so everything will work at the higher ratio
    context.scale(ratio, ratio);
}

let canvas = document.getElementById('canvas');
setInterval(() => scaleCanvas(canvas, canvas.getContext('2d'), 1280, 720), 1000);
let renderer = new LyricRenderer(canvas, 0, 660, 1280, 60);
let renderer2 = new LyricRenderer(canvas, 0, 0, 1280, 60);
renderer.setSong(song, 0);
renderer2.setSong(song, 1);
renderer.setActiveColour('#4287f4');
renderer2.setActiveColour('#f44242');
let noteRenderer = new NoteRenderer(canvas, 20, 410, 1240, 250);
let noteRenderer2 = new NoteRenderer(canvas, 20, 70, 1240, 250);
noteRenderer.setSong(song, 0);
noteRenderer2.setSong(song, 1);
noteRenderer.setColour('#4287f4');
noteRenderer2.setColour('#f44242');

window.noteRenderer = noteRenderer;

let singing = new Singing(song, document.getElementById('audio'));
noteRenderer.setSinger(singing);

document.getElementById('audio').src = require('../media/song.mp3');
document.getElementById('video').src = require('../media/video.mp4');

document.getElementById('video').addEventListener('canplaythrough', () => {
    console.log('video ready');
    document.getElementById('start').removeAttribute('disabled');
});

document.getElementById('start').addEventListener('click', function() {
    this.setAttribute('disabled', 'disabled');
    document.getElementById('audio').play();
});

document.getElementById('audio').addEventListener('playing', function() {
    // let start = Date.now();
    document.getElementById('video').play();
    singing.start();
    let foo = () => {
        let time = document.getElementById('audio').currentTime * 1000 | 0;
        renderer.render(time);
        if (song.parts.length > 1) {
            renderer2.render(time);
        }
        noteRenderer.render(time);
        if (song.parts.length > 1) {
            noteRenderer2.render(time);
        }
        document.getElementById('score').innerHTML = singing.score;
        window.requestAnimationFrame(foo);
    };
    window.requestAnimationFrame(foo);
});

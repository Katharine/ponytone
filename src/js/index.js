import {Song} from "./ultrastar/parser";
import {GameDisplay} from "./display";
import {LocalPlayer} from "./player";

import txt from "../media/notes.txt";

let song = new Song(txt.replace(/\r/g, ""));
let audio = document.getElementById('audio');
let player = new LocalPlayer(song, 0, audio);
player.prepare();
let display = new GameDisplay(document.getElementById('game-container'), 1280, 720, song, [player], audio);
display.createGameLayout();
display.on('ready', () => document.getElementById('start').removeAttribute('disabled'));

audio.src = require('../media/song.mp3');

document.getElementById('start').addEventListener('click', function() {
    this.setAttribute('disabled', 'disabled');
    document.getElementById('audio').play();
});

audio.addEventListener('playing', function() {
    player.start();
    display.start();
});

audio.addEventListener('ended', function() {
    display.stop();
});

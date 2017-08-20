import {GameSession} from "./game";
import {LiveAudio} from "./audio/live";

LiveAudio.requestPermissions();

let song = SONG_ID;

let session = new GameSession(document.getElementById('game-container'), 1280, 720, `https://music.ponytone.online/${song}/notes.txt`);

document.getElementById('loading-image').src = require('../img/loading.png');

session.on('ready', () => {
    document.getElementById('loading').style.display = 'none';
    session.start()
});

document.getElementById('loading').style.display = 'table';
session.prepare();

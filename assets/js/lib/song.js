import {GameSession} from "./game";
// import {LiveAudio} from "./audio/live";
import {RemotePlayer} from "./player";

// LiveAudio.requestPermissions();

let song = SONG_ID;

let session = new GameSession(document.getElementById('game-container'), 1280, 720, `https://music.ponytone.online/${song}/notes.txt`);
session.addPlayer(new RemotePlayer("Player 1", "#058fbe", 0));
session.on('ready', () => {
    if (session.song.parts.length >= 2) {
        session.addPlayer(new RemotePlayer("Player 2", "#d70000", 1));
    }
});

document.getElementById('loading-image').src = require('../../img/loading.png');

session.on('ready', () => {
    document.getElementById('loading').style.display = 'none';
    session.start()
});

document.getElementById('loading').style.display = 'table';
session.prepare();

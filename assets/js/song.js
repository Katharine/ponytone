import {GameSession} from "./game";
import {LiveAudio} from "./audio/live";
import {LocalPlayer, RemotePlayer} from "./player";

LiveAudio.requestPermissions();

let song = SONG_ID;

let session = new GameSession(document.getElementById('game-container'), 1280, 720, `https://music.ponytone.online/${song}/duet.txt`);
session.addPlayer(new RemotePlayer("Player 1", "#058fbe", session.song, 0, session));
session.addPlayer(new RemotePlayer("Player 2", "#d70000"));

document.getElementById('loading-image').src = require('../img/loading.png');

session.on('ready', () => {
    document.getElementById('loading').style.display = 'none';
    session.start()
});

document.getElementById('loading').style.display = 'table';
session.prepare();

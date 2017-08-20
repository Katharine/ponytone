import {GameSession} from "./game";
import {LiveAudio} from "./audio/live";

LiveAudio.requestPermissions();

let song = location.search.substr(1) || 'cupcakes';

let session = new GameSession(document.getElementById('game-container'), 1280, 720, `https://s3-us-west-2.amazonaws.com/mlkonline/${song}/notes.txt`);

document.getElementById('loading-image').src = require('../img/loading.png');

document.getElementById('start').addEventListener('click', function() {
    this.setAttribute('disabled', 'disabled');
    document.getElementById('loading').style.display = 'table';
    session.prepare();
});



session.on('ready', () => {
    document.getElementById('loading').style.display = 'none';
    session.start()
});
"use strict";
import {partyID} from 'page-data';
import {NickPrompt} from "./party/nick"
import {syncTime} from "./util/ntp";
import {GameController} from "./controller";

let readyButton = document.getElementById('ready-button');
document.getElementById('loading-image').src = require('../img/loading.png');

let nickPrompt = new NickPrompt();
let controller = null;
nickPrompt.prompt().then((nick) => {
    controller = new GameController(nick,
        document.getElementById('game-container'),
        document.getElementById('party-container'));
    readyButton.onclick = () => controller.party.setReady();
});


setTimeout(syncTime, 1000);

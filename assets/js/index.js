"use strict";
import {partyID} from 'page-data';
import {NickPrompt} from "./party/nick"
import {Party} from "./party/party";
import {GameSession} from "./game";
import {syncTime} from "./util/ntp";


let session = new GameSession(document.getElementById('game-container'), 1280, 720, `https://music.ponytone.online/eileen/notes.txt`);
session.prepare();
session.on('ready', () => {
    loaded = true;
    updatePartyList.call(p);
});


let nickPrompt = new NickPrompt();
let p = null;
nickPrompt.prompt().then((nick) => {
    p = new Party(nick);
    window.p = p;
    keepDoingThings();
});

let readyButton = document.getElementById('ready-button');

function keepDoingThings() {
    p.on('partyUpdated', updatePartyList);
    p.on('startGame', startGame);
}

let weReadied = false;
let loaded = false;

function updatePartyList() {
    let ul = document.getElementById('party-list');
    ul.innerHTML = '';
    let cantReady = false;
    for(let member of Object.values(this.party)) {
        let li = document.createElement('li');
        let status = '';
        if (member.ready) {
            status = 'ready';
        } else if (member.data || member.me) {
            status = 'waiting';
        } else {
            cantReady = true;
            status = 'connecting';
        }
        if (member.ping !== null) {
            status += ` - ping: ${member.ping}ms`;
        } else if (member.me) {
            status += ' - me!';
        } else {
            cantReady = true;
        }
        li.appendChild(document.createTextNode(`${member.nick} (${status})`));
        ul.appendChild(li);
    }
    if (cantReady || weReadied) {
        readyButton.setAttribute('disabled', 'disabled');
    } else {
        readyButton.removeAttribute('disabled');
    }
}

function startGame() {
    console.log("Starting!", Date.now());
    session.start();
}

readyButton.onclick = function() {
    weReadied = true;
    p.setReady();
};

setTimeout(syncTime, 1000);

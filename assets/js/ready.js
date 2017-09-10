import {getSongMap} from "./tracklist";
import escapeHtml from "escape-html";
import EventEmitter from "events";

export class Ready extends EventEmitter {
    constructor(container, party) {
        super();
        this.container = container;
        this.party = party;
        this.button = document.createElement('button');
        this.button.innerHTML = "Ready!";
        this.button.onclick = () => this._handleReady();
        this.duetContainer = document.createElement('div');
        this.duetContainer.className = 'duet-container';
        this.duetContainer.innerHTML = `<div class="duet-label"><div class="middle">Duet Part</div></div>`;
        this.partSelect = document.createElement('select');
        this.partSelect.size = 1;
        this.partSelect.onchange = () => this._partChanged();
        this.duetContainer.appendChild(this.partSelect);
        this.container.appendChild(this.button);
        this.container.appendChild(this.duetContainer);

        this.party.on('updatedPlaylist', (songs) => this._updatedPlaylist(songs));

        this._hasParts = false;
        this._songID = null;
    }

    async _updatedPlaylist(songs) {
        if (songs.length === 0) {
            this.container.className = '';
            this._hasParts = false;
            return;
        }
        if (songs[0] === this._songID) {
            return;
        }
        this._songID = songs[0];
        let map = await getSongMap();
        let song = map[songs[0]];
        if (song.duet && song.duet.length >= 2) {
            this._hasParts = true;
            this.container.className = 'duet';
            this.partSelect.innerHTML = Array.from(song.duet.entries()).map(([i, x]) => `<option value="${i}">${escapeHtml(x)}</option>`).join('');
            this.partSelect.selectedIndex = this.party.memberIndex % song.duet.length;
            this._partChanged();

        } else {
            this._hasParts = false;
            this.container.className = '';
        }
    }

    _handleReady() {
        this.emit('ready', this.part);
        this.partSelect.setAttribute('disabled', 'disabled');
    }

    _partChanged() {
        this.partSelect.className = `part${this.partSelect.selectedIndex}`;
    }

    reset() {
        this.partSelect.removeAttribute('disabled');
        this._songID = null;
    }

    get part() {
        return this._hasParts ? this.partSelect.selectedIndex : 0;
    }
}
"use strict";
import {default as Clusterize} from 'clusterize.js';

let EventEmitter = require('events');

function formatDuration(seconds) {
    let minutes = '' + ((seconds/60)|0);
    let secs = '' + ((seconds % 60)|0);
    if (secs.length === 1) {
        secs = `0${secs}`;
    }
    return `${minutes}:${secs}`;
}

function renderSong(songInfo) {
    return `<li data-song="${songInfo.id}">
        <img src="//music.ponytone.online/${songInfo.id}/cover.png">
        <span class="song-title">${songInfo.title}</span>
        <span class="song-artist">${songInfo.artist}</span>
        <span class="duration">${formatDuration(songInfo.length)}</span>
    </li>`;
}


let _songData = null;
let _songMapData = null;

function getSongData() {
    return new Promise(function(resolve) {
        if (_songData) {
            resolve(_songData);
            return;
        }
        fetch("/tracklist")
            .then((r) => r.json())
            .then((data) => resolve(_songData = data));
    });
}

function getSongMap() {
    return new Promise((resolve) => {
        if (_songMapData) {
            resolve(_songMapData);
            return;
        }
        getSongData()
            .then((songData) => {
                let result = {};
                for (let song of songData) {
                    result[song.id] = song;
                }
                resolve(_songMapData = result);
            });
    });
}

export class TrackList extends EventEmitter {
    constructor(container) {
        super();
        this.container = container;
        this.ul = document.createElement('ul');
        this.ul.className = 'song-list clusterize-content';
        this.ul.onclick = (e) => this._handleClick(e);

        this.container.innerHTML = '';
        this.container.appendChild(this.ul);
        this.cluster = new Clusterize({
            scrollElem: this.container,
            contentElem: this.ul,
            tag: 'li',
            rows_in_block: 30,
            blocks_in_cluster: 2,
        });
        window.cluster = this.cluster;

        getSongData().then((data) => {
            this.cluster.update(data.map(renderSong));
        });
    }

    _handleClick(e) {
        if (!e.target.dataset.song) {
            return;
        }
        console.log(e.target.dataset.song);
        this.emit('songPicked', parseInt(e.target.dataset.song, 10));
    }
}

export class TrackQueue {
    constructor(container) {
        this.container = container;
        this.ul = document.createElement('ul');
        this.container.innerHTML = '';
        this.container.appendChild(this.ul);
        this.cluster = new Clusterize({
            scrollElem: this.container,
            contentElem: this.ul,
            tag: 'li',
            rows_in_block: 10,
            blocks_in_cluster: 2,
        });
        window.cluster = this.cluster;
    }

    updateQueue(playlist) {
        getSongMap()
            .then((map) => {
                this.cluster.update(playlist.map((i) => renderSong(map[i])));
            });
    }
}

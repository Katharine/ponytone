"use strict";
import Clusterize from 'clusterize.js';

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

async function getSongData(search) {
    if (!_songData) {
        let result = await fetch("/tracklist");
        let json = await result.json();
        _songData = json;
        _songData.sort((a, b) => {
            if (a.artist.toLowerCase() < b.artist.toLowerCase()) {
                return -1;
            } else if (a.artist.toLowerCase() > b.artist.toLowerCase()) {
                return 1;
            } else {
                if (a.title.toLowerCase() < b.title.toLowerCase()) {
                    return -1;
                } else if (a.title.toLowerCase() > b.title.toLowerCase()) {
                    return 1;
                } else {
                    return 0;
                }
            }
        })
    }

    search = search || '';
    search = search.toLowerCase();
    if (search === '') {
        return _songData;
    }
    return _songData.filter((x) => x.title.toLowerCase().includes(search) || x.artist.toLowerCase().includes(search));
}

async function getSongMap() {
    if (_songMapData) {
        return _songMapData;
    }

    let result = {};
    for (let song of await getSongData()) {
        result[song.id] = song;
    }
    return _songMapData = result;
}

export class TrackList extends EventEmitter {
    constructor(container) {
        super();
        this.container = container;
        this.filterDiv = document.createElement('div');
        this.filterDiv.className = 'song-filters';
        this.listContainer = document.createElement('div');
        this.listContainer.className = 'song-list';
        this.searchInput = document.createElement('input');
        this.searchInput.type = "search";
        this.searchInput.className = 'song-search';
        this.searchInput.placeholder = 'Find songs…';
        this.searchInput.oninput = () => this._handleFilter();
        this.ul = document.createElement('ul');
        this.ul.onclick = (e) => this._handleClick(e);

        this.container.innerHTML = '';
        this.filterDiv.appendChild(this.searchInput);
        this.container.appendChild(this.filterDiv);
        this.listContainer.appendChild(this.ul);
        this.container.appendChild(this.listContainer);
        this.cluster = new Clusterize({
            scrollElem: this.listContainer,
            contentElem: this.ul,
            tag: 'li',
            rows_in_block: 30,
            blocks_in_cluster: 2,
        });
        window.cluster = this.cluster;

        this._handleFilter();
    }

    _handleClick(e) {
        if (!e.target.dataset.song) {
            return;
        }
        console.log(e.target.dataset.song);
        this.emit('songPicked', parseInt(e.target.dataset.song, 10));
    }

    async _handleFilter() {
        let songs = await getSongData(this.searchInput.value);
        this.cluster.update(songs.map(renderSong));
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

    async updateQueue(playlist) {
        let map = await getSongMap();
        this.cluster.update(playlist.map((i) => renderSong(map[i])));
    }
}

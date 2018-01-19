"use strict";
import * as Clusterize from 'clusterize.js';
import {EventEmitter} from "events";

export interface SongIndexEntry {
    id: number;
    title: string;
    artist: string;
    length: number;
    cover: string;
    duet?: string[];
}

export interface SongIndexMap {
    [key: number]: SongIndexEntry;
}

function formatDuration(seconds: number): string {
    let minutes = '' + ((seconds/60)|0);
    let secs = '' + ((seconds % 60)|0);
    if (secs.length === 1) {
        secs = `0${secs}`;
    }
    return `${minutes}:${secs}`;
}

function renderSong(songInfo: SongIndexEntry): string {
    return `<li data-song="${songInfo.id}">
        <img src="//music.ponytone.online/${songInfo.id}/${songInfo.cover}">
        <span class="song-title">${songInfo.title}</span>
        <span class="song-artist">${songInfo.artist}</span>
        <span class="duration">${formatDuration(songInfo.length)}</span>
    </li>`;
}


let _songData: SongIndexEntry[] = null;
let _songMapData: SongIndexMap = null;

export async function getSongData(search?: string): Promise<SongIndexEntry[]> {
    if (!_songData) {
        let result = await fetch("/tracklist");
        _songData = await result.json();
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

export async function getSongMap(): Promise<SongIndexMap> {
    if (_songMapData) {
        return _songMapData;
    }

    let result: SongIndexMap = {};
    for (let song of await getSongData()) {
        result[song.id] = song;
    }
    return _songMapData = result;
}

export class TrackList extends EventEmitter {
    private container: HTMLElement;
    private filterDiv: HTMLDivElement;
    private listContainer: HTMLDivElement;
    private searchInput: HTMLInputElement;
    private ul: HTMLUListElement;
    private cluster: Clusterize;

    constructor(container: HTMLElement) {
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

        this._handleFilter();
    }

    _handleClick(e: MouseEvent): void {
        let target = <HTMLElement>e.target;
        if (!target.dataset.song) {
            return;
        }
        console.log(target.dataset.song);
        this.emit('songPicked', parseInt(target.dataset.song, 10));
    }

    async _handleFilter(): Promise<void> {
        let songs = await getSongData(this.searchInput.value);
        this.cluster.update(songs.map(renderSong));
    }
}

export class TrackQueue {
    private container: HTMLElement;
    private ul: HTMLUListElement;
    private cluster: Clusterize;

    constructor(container: HTMLElement) {
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
            no_data_text: "Random!",
            no_data_class: "track-queue-empty",
        });
    }

    async updateQueue(playlist: number[]): Promise<void> {
        let map = await getSongMap();
        this.cluster.update(playlist.map((i) => renderSong(map[i])));
    }
}

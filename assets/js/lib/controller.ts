import {Party, PartyMember} from "./party/party";
import {GameSession} from "./game";
import {PartyList} from "./party/partylist";
import {TrackList, TrackQueue} from "./tracklist";
import {LocalPlayer, RemotePlayer} from "./player";
import {Ready} from "./ready";
import * as escapeHtml from "escape-html";
import {SungNote} from "./audio/live";

export class GameController {
    private gameContainer: HTMLElement;
    private party: Party;
    private trackList: TrackList;
    private partyList: PartyList;
    private trackQueue: TrackQueue;
    private ready: Ready;
    private session: GameSession;
    private lastTransmittedBeat: number;
    private beatTransmitInterval: number;
    private remotePlayers: {[key: string]: RemotePlayer};
    private loadingScreen: boolean;

    constructor(nick: string, gameContainer: HTMLElement, partyContainer: HTMLElement) {
        this.gameContainer = gameContainer;

        this.party = new Party(nick);
        this.party.on('loadTrack', (track) => this._loadTrack(track));
        this.party.on('startGame', () => this._startGame());
        this.party.network.on('sangNotes', (message, peer) => this._receivedNotes(peer, message.score, message.notes));

        this.trackList = new TrackList(document.getElementById('track-list-container'));
        this.trackList.on('songPicked', (song) => this._addSong(song));

        this.partyList = new PartyList(partyContainer, this.party);
        this.party.on('partyUpdated', () => this._updatePartyList());
        this.party.on('updatedPlaylist', (playlist) => this._updatePlaylist(playlist));

        this.trackQueue = new TrackQueue(document.getElementById('queue-scroll'));

        this.ready = new Ready(document.getElementById('ready-container'), this.party);
        this.ready.on('ready', (part) => this._handleReady(part));

        this.session = null;
        this.lastTransmittedBeat = -1;
        this.beatTransmitInterval = null;
        this.remotePlayers = {};
        this.loadingScreen = false;
        window.addEventListener('resize', () => this._handleResize());
    }

    private _handleResize(): void {
        if (this.session) {
            this.session.setSize(window.innerWidth, window.innerHeight);
        }
    }

    private _loadTrack(track: number): void {
        document.getElementById('loading').style.display = 'block';
        this.loadingScreen = true;
        this.session = new GameSession(this.gameContainer, window.innerWidth, window.innerHeight, `https://music.ponytone.online/${track}/notes.txt`);

        this.session.prepare();
        this.session.on('ready', () => this._handleTrackLoaded());
        this.session.on('finished', () => this._handleTrackFinished());
        this._updateLoadingList();
    }

    private _startGame(): void {
        document.getElementById('loading').style.display = 'none';
        this.loadingScreen = false;
        this.session.start();
        this.beatTransmitInterval = setInterval(() => this._transmitBeats(), 66);
    }

    private _transmitBeats(): void {
        let notes = this.session.localPlayer.singing.notesInRange(this.lastTransmittedBeat + 1, Infinity);
        if (!notes.length) {
            return;
        }
        this.lastTransmittedBeat = notes[notes.length - 1].time;
        this.party.network.broadcast({action: "sangNotes", notes: notes, score: this.session.localPlayer.score});
    }

    private _receivedNotes(peer: string, score: number, notes: SungNote[]) {
        let player = this.remotePlayers[peer];
        if (!player) {
            return;
        }
        player.score = score;
        player.addNotes(notes);
    }

    private _handleTrackLoaded(): void {
        let keys = Object.keys(this.party.party);
        keys.sort();
        for (let [peer, member] of keys.map((k) => <[string, PartyMember]>[k, this.party.party[k]])) {
            if (member.me) {
                let player = new LocalPlayer(member.nick, member.colour, this.session.song, member.part, this.session);
                this.session.addPlayer(player);
                player.prepare();
                continue;
            }
            let player = new RemotePlayer(member.nick, member.colour, member.part);
            this.remotePlayers[peer] = player;
            this.session.addPlayer(player);
        }

        this.party.trackDidLoad();
    }

    private _updatePartyList(): void {
        this.partyList.update();
        if (this.loadingScreen) {
            this._updateLoadingList();
        }
    }

    private _updateLoadingList(): void {
        let waiting = [];
        for (let member of Object.values(this.party.sessionParty)) {
            if (!member.loaded) {
                waiting.push(member.nick);
            }
        }
        document.getElementById('loading-list').innerHTML = waiting.map(escapeHtml).join('<br>');
    }

    private _updatePlaylist(playlist: number[]): void {
        this.trackQueue.updateQueue(playlist);
    }

    private _handleTrackFinished(): void {
        this._transmitBeats();
        this.party.me.score = this.session.localPlayer.score;
        clearInterval(this.beatTransmitInterval);
        this.lastTransmittedBeat = -1;
        this.session.cleanup();
        this.session = null;
        this.party.trackEnded();
        this.partyList.update();
        this.ready.reset();
    }

    private _addSong(song: number): void {
        console.log(`Adding ${song} to the queue...`);
        this.party.addToPlaylist(song);
    }

    private _handleReady(part: number): void {
        this.party.setReady(part);
    }
}

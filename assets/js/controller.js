import {Party} from "./party/party";
import {GameSession} from "./game";
import {PartyList} from "./party/partylist";
import {TrackList, TrackQueue} from "./tracklist";
import {LocalPlayer, RemotePlayer} from "./player";

export class GameController {
    constructor(nick, gameContainer, partyContainer) {
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

        this.session = null;
        this.lastTransmittedBeat = -1;
        this.beatTransmitInterval = null;
        this.remotePlayers = {};
        window.addEventListener('resize', () => this._handleResize());
    }

    _handleResize() {
        if (this.session) {
            this.session.setSize(window.innerWidth, window.innerHeight);
        }
    }

    _loadTrack(track) {
        document.getElementById('loading').style.display = 'table';
        this.session = new GameSession(this.gameContainer, window.innerWidth, window.innerHeight, `https://music.ponytone.online/${track}/notes.txt`);

        this.session.prepare();
        this.session.on('ready', () => this._handleTrackLoaded());
        this.session.on('finished', () => this._handleTrackFinished());
    }

    _startGame() {
        document.getElementById('loading').style.display = 'none';
        this.session.start();
        this.beatTransmitInterval = setInterval(() => this._transmitBeats(), 66);
    }

    _transmitBeats() {
        let notes = this.session.localPlayer.singing.notesInRange(this.lastTransmittedBeat + 1, Infinity);
        if (!notes.length) {
            return;
        }
        this.lastTransmittedBeat = notes[notes.length - 1].time;
        this.party.network.broadcast({action: "sangNotes", notes: notes, score: this.session.localPlayer.score});
    }

    _receivedNotes(peer, score, notes) {
        let player = this.remotePlayers[peer];
        player.score = score;
        player.addNotes(notes);
    }

    _handleTrackLoaded() {
        let keys = Object.keys(this.party.party);
        keys.sort();
        for (let [peer, member] of keys.map((k) => [k, this.party.party[k]])) {
            if (member.me) {
                let player = new LocalPlayer(member.nick, member.colour, this.session.song, 0, this.session);
                this.session.addPlayer(player);
                player.prepare();
                continue;
            }
            let player = new RemotePlayer(member.nick, member.colour);
            this.remotePlayers[peer] = player;
            this.session.addPlayer(player);
        }

        this.party.trackDidLoad();
    }

    _updatePartyList() {
        this.partyList.update();
    }

    _updatePlaylist(playlist) {
        this.trackQueue.updateQueue(playlist);
    }

    _handleTrackFinished() {
        this._transmitBeats();
        this.party.me.score = this.session.localPlayer.score;
        clearInterval(this.beatTransmitInterval);
        this.lastTransmittedBeat = -1;
        this.session.cleanup();
        this.session = null;
        this.party.trackEnded();
        this.partyList.update();
    }

    _addSong(song) {
        console.log(`Adding ${song} to the queue...`);
        this.party.addToPlaylist(song);
    }
}

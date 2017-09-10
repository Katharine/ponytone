import {NetworkSession} from "./comms";
import {fixedTimestamp} from "../util/ntp";
import EventEmitter from "events";

// sequence:
// 1) everyone joins
// 2) playlist constructed
// 3) everyone hits 'ready'
// 4) master broadcasts song selection
// 5) wait for everyone to reach ready state, announcing when done
// 6) master announces start time
// 7) game starts
// 8) song completes; return to 3

export class Party extends EventEmitter {
    constructor(nick) {
        super();
        this.nick = nick;
        this.party = {};
        this.queue = [];
        this.sessionParty = null;
        this.playing = false;
        this.network = new NetworkSession(this.nick);
        this.network.on('gotMemberList', (members) => this._handleMemberList(members));
        this.network.on('newMember', (member) => this._handleNewMember(member));
        this.network.on('memberLeft', (member) => this._handleMemberLeft(member));
        this.network.on('readyToGo', (message, peer) => this._handleReady(peer, message.part));
        this.network.on('dataChannelEstablished', (peer) => this._handleDataReady(peer));
        this.network.on('startGame', (message, peer) => this._handleStartGame(message.time));
        this.network.on('loadTrack', (message, peer) => this._handleLoadTrack(message.track));
        this.network.on('trackLoaded', (message, peer) => this._handleTrackLoaded(peer));
        this.network.on('updatedPlaylist', (songs) => this._handleUpdatedPlaylist(songs));
        this.network.on('sangNotes', (message, peer) => this._updateScore(peer, message.score));
    }

    _makeMember(nick, colour) {
        return {
            nick: nick,
            colour: colour,
            data: false,
            ping: null,
            ready: false,
            me: false,
            loaded: false,
            score: null,
            part: 0,
        }
    }

    _updateScore(peer, score) {
        this.party[peer].score = score;
    }

    _handleMemberList(members) {
        this.party = {};
        for (let [channel, {nick, colour}] of Object.entries(members)) {
            this.party[channel] = this._makeMember(nick, colour);
            if (this.network.channelName === channel) {
                this.party[channel].me = true;
            }
        }
        this.emit('partyUpdated');
    }

    _handleNewMember(member) {
        this.party[member.channel] = this._makeMember(member.nick, member.colour);
        if (this.network.channelName === member.channel) {
            this.party[member.channel].me = true;
        }
        this.emit('partyUpdated');
    }

    _handleMemberLeft(member) {
        delete this.party[member.channel];
        if (this.sessionParty) {
            delete this.sessionParty[member.channel];
            if (this.playing) {
                this._handleTrackLoaded();
            }
        }
        this.emit('partyUpdated');
    }

    async _handleDataReady(peer) {
        this.party[peer].data = true;
        this.emit('partyUpdated');
        this.party[peer].ping = await this.network.rtcConnection(peer).testLatency(5000);
        this.emit('partyUpdated');
    }

    _handleReady(peer, part) {
        this.party[peer].ready = true;
        this.party[peer].part = part;
        this.emit('partyUpdated');
        if (this.playing) {
            console.warn("Got ready message but already playing.");
            return;
        }
        let pending = Object.values(this.party).reduce((a, v) => a + (v.ready ? 0 : 1), 0);
        if (pending === 0) {
            if (this.isMaster) {
                console.log("Time to begin!");
                this._broadcastTrack();
            } else {
                console.log("Waiting for the master to start...");
            }
        } else {
            console.log(`${pending} left to confirm...`);
        }
    }

    _handleTrackLoaded(peer) {
        if (peer) {
            this.sessionParty[peer].loaded = true;
            this.emit('partyUpdated');
        }
        console.log('session members', this.sessionParty);
        let pending = Object.values(this.sessionParty).reduce((a, v) => a + (v.loaded ? 0 : 1), 0);
        if (pending === 0) {
            if (this.isMaster) {
                console.log("Time to begin!");
                this._startGame();
            } else {
                console.log("Waiting for the master to start...");
            }
        } else {
            console.log(`${pending} left to finish downloading...`);
        }
    }

    _broadcastTrack() {
        let song = this.queue[0];
        if (!song) {
            song = (Math.random() * 900)|0;
        }
        this.network.broadcast({action: "loadTrack", track: song});
        this.network.ws.send({action: "removeFromQueue", song: song});
        this._handleLoadTrack(song);
    }

    _handleLoadTrack(track) {
        if (this.playing) {
            console.warn("Got load track command when already playing.");
            return;
        }
        this.playing = true;
        for (let member of Object.values(this.party)) {
            member.loaded = false;
        }
        this.sessionParty = {...this.party};
        console.log('session members', this.sessionParty);
        this.emit("partyUpdated");
        this.emit("loadTrack", track);
    }

    trackDidLoad() {
        this.network.broadcast({action: "trackLoaded"});
        this._handleTrackLoaded(this.network.channelName);
    }

    _startGame() {
        let maxPing = Object.values(this.sessionParty).reduce((a, v) => a + (v.ping||0), 0) / 2;
        let startTime = Math.round(fixedTimestamp() + maxPing * 1.5);
        startTime += 50; // because if it's very short other issues can appear.
        this._handleStartGame(startTime);
        this.network.broadcast({action: "startGame", time: startTime});
    }

    _handleStartGame(time) {
        let now = fixedTimestamp();
        let delay = time - now;
        setTimeout(() => this.emit("startGame"), delay);
        console.log(`Game start in ${delay}ms.`);
        for (let member of Object.values(this.sessionParty)) {
            member.loaded = false;
            member.ready = false;
        }
    }

    _handleUpdatedPlaylist(songs) {
        this.queue = songs;
        this.emit('updatedPlaylist', songs);
    }

    setReady(part) {
        this.network.broadcast({action: "readyToGo", part});
        this._handleReady(this.network.channelName, part);
    }

    trackEnded() {
        this.playing = false;
        this.sessionParty = null;
        this.emit('partyUpdated');
    }

    addToPlaylist(id) {
        this.network.ws.send({action: "addToQueue", song: id})
    }

    get isMaster() {
        let peers = Object.keys(this.sessionParty || this.party);
        peers.sort();
        return (this.network.channelName === peers[0]);
    }

    get me() {
        return this.party[this.network.channelName];
    }

    get memberIndex() {
        let peers = Object.values(this.sessionParty || this.party);
        peers.sort();
        return peers.findIndex((x) => x.me);
    }
}
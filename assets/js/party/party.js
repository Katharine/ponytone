import {NetworkSession} from "./comms";
import {fixedTimestamp} from "../util/ntp";

let EventEmitter = require("events");

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
        this.network = new NetworkSession(this.nick);
        this.network.on('gotMemberList', (members) => this._handleMemberList(members));
        this.network.on('newMember', (member) => this._handleNewMember(member));
        this.network.on('memberLeft', (member) => this._handleMemberLeft(member));
        this.network.on('readyToGo', (message, peer) => this._handleReady(peer));
        this.network.on('dataChannelEstablished', (peer) => this._handleDataReady(peer));
        this.network.on('startGame', (message, peer) => this._handleStartGame(message.time));
        this.network.on('loadTrack', (message, peer) => this._handleLoadTrack(message.track));
        this.network.on('trackLoaded', (message, peer) => this._handleTrackLoaded(peer));
    }

    _makeMember(nick) {
        return {
            nick: nick,
            data: false,
            ping: null,
            ready: false,
            me: false,
            loaded: false,
        }
    }

    _handleMemberList(members) {
        for (let [channel, nick] of Object.entries(members)) {
            this.party[channel] = this._makeMember(nick);
            if (this.network.channelName === channel) {
                this.party[channel].me = true;
            }
        }
        this.emit('partyUpdated');
    }

    _handleNewMember(member) {
        this.party[member.channel] = this._makeMember(member.nick);
        if (this.network.channelName === member.channel) {
            this.party[member.channel].me = true;
        }
        this.emit('partyUpdated');
    }

    _handleMemberLeft(member) {
        delete this.party[member.channel];
        this.emit('partyUpdated');
    }

    _handleDataReady(peer) {
        this.party[peer].data = true;
        this.network.rtcConnection(peer).testLatency(5000).then((ping) => {
            this.party[peer].ping = ping;
            this.emit('partyUpdated');
        });
        this.emit('partyUpdated');
    }

    _handleReady(peer) {
        this.party[peer].ready = true;
        this.emit('partyUpdated');
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
        this.party[peer].loaded = true;
        this.emit('partyUpdated');
        let pending = Object.values(this.party).reduce((a, v) => a + (v.loaded ? 0 : 1), 0);
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
        this.network.broadcast({action: "loadTrack", track: "ladadee"});
        this._handleLoadTrack("ladadee");
    }

    _handleLoadTrack(track) {
        for (let member of Object.values(this.party)) {
            member.loaded = false;
        }
        this.emit("partyUpdated");
        this.emit("loadTrack", track);
    }

    trackDidLoad() {
        this.network.broadcast({action: "trackLoaded"});
        this._handleTrackLoaded(this.network.channelName);
    }

    _startGame() {
        let maxPing = Object.values(this.party).reduce((a, v) => a + (v.ping||0), 0) / 2;
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

    }

    setReady() {
        this.network.broadcast({action: "readyToGo"});
        this._handleReady(this.network.channelName);
    }

    trackEnded() {
        for (let member of Object.values(this.party)) {
            member.loaded = false;
            member.ready = false;
        }
        this.emit('partyUpdated');
    }

    get isMaster() {
        let peers = Object.keys(this.party);
        peers.sort();
        return (this.network.channelName === peers[0]);
    }
}
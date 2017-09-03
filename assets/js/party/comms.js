import {WebSocketBridge} from "django-channels";
import {PeerConnection} from './p2p';
import {partyID} from 'page-data';

let EventEmitter = require("events");

export class NetworkSession extends EventEmitter {
    constructor(nick) {
        super();
        this.ws = new WebSocketBridge();
        this.ws.connect(`/karaoke/party/${partyID}`);
        this.ws.listen((action, stream) => this._handleMessage(action, stream));

        this.nick = nick;
        this.channelName = null;
        this.rtcConnections = {};
        this.party = {};
    }

    relayTo(target, message) {
        this.ws.send({action: "relay", target: target, message: message})
    }

    broadcast(message) {
        for (let connection of Object.values(this.rtcConnections)) {
            connection.send(message);
        }
    }

    sendTo(target, message) {
        this.rtcConnection(target).send(message);
    }

    _handleMessage(message, stream) {
        console.log(message);
        switch (message.action) {
            case "hello":
                this.channelName = message.channel;
                this.ws.send({action: "hello", nick: this.nick});
                this.emit("connected");
                break;
            case "goodbye":
                console.log("rejected.");
                this.ws.socket.close();
                alert(`Connection rejected by the server: ${message.message}.`);
                location.reload();
                this.emit("disconnected");
                break;
            case "new_member":
                if (message.channel === this.channelName) {
                    console.log("I'm in.");
                } else {
                    console.log(`New user: ${message.nick} (${message.channel})`);
                    this._establishConnection(message);
                }
                this._newMember(message);
                this.emit("newMember", {
                    nick: message.nick,
                    channel: message.channel,
                    colour: message.colour,
                    id: message.id,
                });
                break;
            case "member_list":
                this.party = {};
                console.log("Got member list.");
                for (let [channel, {nick, colour}] of Object.entries(message.members)) {
                    this._newMember({channel, nick, colour});
                }
                this.emit("gotMemberList", message.members);
                break;
            case "member_left":
                if (message.channel === this.channelName) {
                    console.warn("Apparently we left?");
                } else {
                    console.log(`Member left: ${message.nick} (${message.channel})`);
                }
                this.emit("memberLeft", {nick: message.nick, channel: message.channel});
                if (this.rtcConnections[message.channel]) {
                    this.rtcConnections[message.channel].close();
                }
                delete this.party[message.channel];
                break;
            case "relay":
                console.log(`Got a relayed message from ${message['origin']}.`);
                this.rtcConnection(message.origin); // ensure an RTC connection exists in case it cares.
                this.emit("relayedMessage", message.origin, message.message);
                break;
            case "playlist":
                this.emit("updatedPlaylist", message.playlist);
                break;
        }
    }

    rtcConnection(peer) {
        if (!this.rtcConnections[peer]) {
            let connection = new PeerConnection(this, peer);
            connection.on('close', () => {
                delete this.rtcConnections[peer];
                this.emit('connectionLost', peer);
            });
            connection.on('data', (action, message) => this.emit(action, message, peer));
            connection.on('dataChannelAvailable', () => this.emit('dataChannelEstablished', peer));
            this.rtcConnections[peer] = connection;
        }
        return this.rtcConnections[peer];
    }

    _newMember(member) {
        this.party[member.channel] = {
            nick: member.nick
        }
    }

    _establishConnection(message) {
        let {nick, channel} = message;
        let rtc = this.rtcConnection(channel);
        rtc.connect();
    }
}

import {WebSocketBridge} from "django-channels";
import {PeerConnection} from './p2p';
import {partyID} from 'page-data';
import {EventEmitter} from "events";

export interface NetworkMember {
    channel: string;
    nick: string;
    colour: string;
}

export class NetworkSession extends EventEmitter {
    nick: string;
    channelName: string;
    private rtcConnections: {[key: string]: PeerConnection};
    private ws: WebSocketBridge;
    party: {[key: string]: NetworkMember};

    constructor(nick: string) {
        super();
        this.ws = new WebSocketBridge();
        this.ws.connect(`/karaoke/party/${partyID}`);
        this.ws.listen((action) => this._handleMessage(action));

        this.nick = nick;
        this.channelName = null;
        this.rtcConnections = {};
        this.party = {};
    }

    on(event: 'connected', listener: () => void): this;
    on(event: 'disconnected', listener: () => void): this;
    on(event: 'newMember', listener: (member: NetworkMember) => void): this;
    on(event: 'gotMemberList', listener: (list: {[key: string]: {nick: string, colour: string}}) => void): this;
    on(event: 'memberLeft', listener: (member: {nick: string, channel: string}) => void): this;
    on(event: 'relayedMessage', listener: (origin: string, message: RelayedMessage) => void): this;
    on(event: 'updatedPlaylist', listener: (playlist: number[]) => void): this;
    on(event: 'connectionLost', listener: (peer: string) => void): this;
    // events sent from other clients
    on(event: 'dataChannelEstablished', listener: (peer: string) => void): this;
    on(event: 'sangNotes', listener: (message: SangNotesMessage, peer: string) => void): this;
    on(event: 'loadTrack', listener: (message: LoadTrackMessage, peer: string) => void): this;
    on(event: 'readyToGo', listener: (message: ReadyMessage, peer: string) => void): this;
    on(event: 'trackLoaded', listener: (message: TrackLoadedMessage, peer: string) => void): this;
    on(event: 'startGame', listener: (message: StartGameMessage, peer: string) => void): this;
    on(event: string, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    relayTo(target: string, message: any): void {
        this.ws.send({action: "relay", target: target, message: message})
    }

    broadcast(message: GameMessage): void {
        for (let connection of Object.values(this.rtcConnections)) {
            connection.send(message);
        }
    }

    sendTo(target: string, message: GameMessage): void {
        this.rtcConnection(target).send(message);
    }

    sendToServer(message: WebsocketMessage): void {
        this.ws.send(message);
    }


    private _handleMessage(message: WebsocketMessage): void {
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

    rtcConnection(peer: string): PeerConnection {
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

    _newMember(member: NetworkMember): void {
        this.party[member.channel] = {...member};
    }

    _establishConnection(message: NewMemberMessage) {
        let {channel} = message;
        let rtc = this.rtcConnection(channel);
        rtc.connect();
    }
}

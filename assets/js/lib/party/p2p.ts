import {turnAuth} from "page-data";
import {EventEmitter} from "events";
import {NetworkSession} from "./comms";

export class PeerConnection extends EventEmitter {
    private peer: string;
    private networkSession: NetworkSession;
    private connection: RTCPeerConnection;
    private dataStream: RTCDataChannel;
    private dataAvailable: boolean;
    private _pendingCandidates: RTCIceCandidate[];


    constructor(networkSession: NetworkSession, peer: string) {
        super();
        this.networkSession = networkSession;
        this.peer = peer;
        this.connection = null;
        this.dataStream = null;
        this.dataAvailable = false;
        this._pendingCandidates = [];
        this.networkSession.on('relayedMessage', (origin, message) => this._handleRelayMessage(origin, message));

        this.on('ping', (message) => this._handlePing(message));
    }

    on(event: 'close', listener: () => any): this;
    on(event: 'data', listener: (action: string, message: GameMessage | NetworkingMessage) => any): this;
    on(event: 'dataChannelAvailable', listener: () => any): this;
    on(event: 'ping', listener: (message: PingMessage) => any): this;
    on(event: string, listener: (...args: any[]) => any): this {
        return super.on(event, listener);
    }

    connect(): void {
        this._createConnection();
        this.dataStream = this.connection.createDataChannel(`p2p-${this.peer}`);
        this.dataStream.onopen = () => this._handleDataOpen();
        this.dataStream.onmessage = (e) => this._handleDataMessage(e.data);
    }

    close(): void {
        if (this.connection) {
            this.connection.close();
        }
    }

    testLatency(timeout?: number): Promise<number> {
        timeout = timeout || 5000;
        return new Promise((resolve, reject) => {
            let timer = setTimeout(reject, timeout);
            this.once("pong", (message) => {
                resolve(Date.now() - message.time);
                clearTimeout(timer);
            });
            this.send({action: "ping", time: Date.now()});
        });
    }

    send(message: AnyMessage): void {
        if (this.dataAvailable) {
            this.dataStream.send(JSON.stringify(message));
        } else {
            throw new Error("Data stream not available yet.");
        }
    }

    private _handlePing(message: PingMessage): void {
        this.send({action: "pong", time: message.time})
    }

    private async _receiveConnection(sdp: any): Promise<void> {
        try {
            this._createConnection();
            let desc = new RTCSessionDescription(sdp);
            await this.connection.setRemoteDescription(desc);
            let answer = await this.connection.createAnswer();
            await this.connection.setLocalDescription(answer);

            this.networkSession.relayTo(this.peer, {action: 'rtc-response', sdp: this.connection.localDescription});
            await this._processPendingCandidates();
        } catch (e) {
            this._connectionEstablishmentError(e);
        }
    }

    private _handleRelayMessage(origin: string, message: ICEMessage): void {
        if (origin !== this.peer) {
            return;
        }
        switch(message.action) {
            case 'rtc-start':
                console.log("Got RTC invitation.");
                this._receiveConnection(message.sdp);
                break;
            case 'rtc-response':
                console.log("Got RTC response.");
                this._handleInboundDescription(message.sdp);
                break;
            case 'new-ice-candidate':
                this._handleInboundICECandidate(message.candidate);
                break;
        }
    }

    private async _processPendingCandidates(): Promise<void> {
        console.log('process pending candidates');
        for (let c of this._pendingCandidates) {
            console.log("Adding pending candidate...");
            await this.connection.addIceCandidate(c);
        }
        this._pendingCandidates = null;
    }

    private _createConnection(): void {
        this.connection = new RTCPeerConnection({
            iceServers: [{
                urls: "turn:sfo.turn.ponytone.online",
                username: turnAuth.username,
                credential: turnAuth.password,
            }]
        });
        this.connection.onicecandidate = (e) => this._handleICECandidate(e);
        // this.connection.onaddstream = (e) => this._handleAddStream(e);
        this.connection.onnegotiationneeded = () => this._performNegotiation();
        this.connection.ondatachannel = (e) => this._handleDataChannel(e.channel);
        this.connection.oniceconnectionstatechange = () => this._handleConnectionStateChange();
    }

    private _handleConnectionStateChange(): void {
        console.log(`Connection state changed: ${this.connection.iceConnectionState}`);
        switch(this.connection.iceConnectionState) {
            case "failed":
                console.error("Connection failed.");
                // fallthrough
            case "closed":
            case "disconnected":
                this.emit("close");
                break;
        }
    }

    private async _performNegotiation(): Promise<void> {
        try {
            console.log('Initiating negotiation.');
            let offer = await this.connection.createOffer();
            await this.connection.setLocalDescription(offer);

            this.networkSession.relayTo(this.peer, {
                action: "rtc-start",
                sdp: this.connection.localDescription,
            });
        } catch (e) {
            this._connectionEstablishmentError(e);
        }
    }

    private _handleICECandidate(e: RTCPeerConnectionIceEvent) {
        if (e.candidate) {
            this.networkSession.relayTo(this.peer, {
                action: "new-ice-candidate",
                candidate: e.candidate
            });
        }
    }

    private _handleDataOpen(): void {
        console.log("Data stream available!");
        this.dataAvailable = true;
        this.emit("dataChannelAvailable");
    }

    private _handleDataMessage(data: string): void {
        console.log(`Got P2P data from ${this.peer}:`, data);
        let parsed = <Message>JSON.parse(data);
        let {action} = parsed;
        this.emit("data", action, parsed);
        this.emit(action, parsed);
    }

    private _handleDataChannel(stream: RTCDataChannel): void {
        console.log('got a data channel', stream);
        this.dataStream = stream;
        this.dataStream.onopen = () => this._handleDataOpen();
        this.dataStream.onmessage = (e) => this._handleDataMessage(e.data);
    }

    private _handleInboundICECandidate(c: RTCIceCandidate): void {
        console.log("ICE Candidate", c);
        let candidate = new RTCIceCandidate(c);
        if (this._pendingCandidates !== null) {
            this._pendingCandidates.push(candidate);
            console.log("delaying...");
        } else {
            console.log('adding...');
            this.connection.addIceCandidate(candidate)
                .catch((e) => this._connectionEstablishmentError(e));
        }
    }

    private async _handleInboundDescription(sdp: any): Promise<void> {
        try {
            let desc = new RTCSessionDescription(sdp);
            await this.connection.setRemoteDescription(desc);
            await this._processPendingCandidates();
        } catch (e) {
            this._connectionEstablishmentError(e);
        }
    }

    private _connectionEstablishmentError(e: Error): void {
        console.error("RTC connection failed", e);
        this.emit("error", e);
    }
}
import {turnAuth} from "page-data";
import EventEmitter from "events";

export class PeerConnection extends EventEmitter {
    constructor(networkSession, peer) {
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

    connect() {
        this._createConnection();
        this.dataStream = this.connection.createDataChannel(`p2p-${this.peer}`);
        this.dataStream.onopen = () => this._handleDataOpen();
        this.dataStream.onmessage = (e) => this._handleDataMessage(e.data);
    }

    close() {
        if (this.connection) {
            this.connection.close();
        }
    }

    testLatency(timeout) {
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

    _handlePing(message) {
        this.send({action: "pong", time: message.time})
    }

    async _receiveConnection(sdp) {
        try {
            this._createConnection();
            let desc = new RTCSessionDescription(sdp);
            await this.connection.setRemoteDescription(desc);
            let answer = await this.connection.createAnswer();
            await this.connection.setLocalDescription(answer);

            this.networkSession.relayTo(this.peer, {action: 'rtc-response', sdp: this.connection.localDescription});
            this._processPendingCandidates();
        } catch (e) {
            this._connectionEstablishmentError(e);
        }
    }

    _handleRelayMessage(origin, message) {
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

    _processPendingCandidates() {
        console.log('process pending candidates');
        for (let c of this._pendingCandidates) {
            console.log("Adding pending candidate...");
            this.connection.addIceCandidate(c);
        }
        this._pendingCandidates = null;
    }

    _createConnection() {
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
        this.connection.onicesignallingstatechange = () => this._handleSignallingStateChange();
    }

    _handleConnectionStateChange() {
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

    _handleSignallingStateChange() {
        console.log(`Signalling state changed: ${this.connection.signallingState}`);
        if (this.connection.signallingState === "closed") {
            this.emit("close");
        }
    }

    async _performNegotiation() {
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

    _handleICECandidate(e) {
        if (e.candidate) {
            this.networkSession.relayTo(this.peer, {
                action: "new-ice-candidate",
                candidate: e.candidate
            });
        }
    }

    _handleDataOpen() {
        console.log("Data stream available!");
        this.dataAvailable = true;
        this.emit("dataChannelAvailable");
    }

    _handleDataMessage(data) {
        console.log(`Got P2P data from ${this.peer}:`, data);
        let parsed = JSON.parse(data);
        let {action} = parsed;
        this.emit("data", action, parsed);
        this.emit(action, parsed);
    }

    _handleDataChannel(stream) {
        console.log('got a data channel', stream);
        this.dataStream = stream;
        this.dataStream.onopen = () => this._handleDataOpen();
        this.dataStream.onmessage = (e) => this._handleDataMessage(e.data);
    }

    send(message) {
        if (this.dataAvailable) {
            this.dataStream.send(JSON.stringify(message));
        } else {
            throw new Error("Data stream not available yet.");
        }
    }

    _handleInboundICECandidate(c) {
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

    async _handleInboundDescription(sdp) {
        try {
            let desc = new RTCSessionDescription(sdp);
            await this.connection.setRemoteDescription(desc);
            this._processPendingCandidates();
        } catch (e) {
            this._connectionEstablishmentError(e);
        }
    }

    _connectionEstablishmentError(e) {
        console.error("RTC connection failed", e);
        this.emit("error", e);
    }
}
interface Message {
    action: string;
    [key: string]: any;
}

// Messages sent over websockets (from the server, except for RelayMessage's contents).
interface HelloMessage {
    action: 'hello';
    channel: string;
}

interface GoodbyeMessage {
    action: 'goodbye';
    message: string;
}

interface NewMemberMessage {
    action: 'new_member';
    channel: string;
    nick: string;
    colour: string;
    id: number;
}

interface MemberListMessage {
    action: 'member_list';
    members: {[key: string]: {nick: string, colour: string, id: number}};
}

interface MemberLeftMessage {
    action: 'member_left';
    channel: string;
    nick: string;
}

interface RelayMessage {
    action: 'relay';
    origin: string;
    message: any;
}

interface PlaylistMessage {
    action: 'playlist';
    playlist: number[];
}

interface RemoveFromQueueMessage {
    action: 'removeFromQueue';
    song: number;
}

interface AddToQueueMessage {
    action: 'addToQueue';
    song: number;
}

type WebsocketMessage = HelloMessage | GoodbyeMessage | NewMemberMessage | MemberListMessage |
    MemberLeftMessage | RelayMessage | PlaylistMessage | RemoveFromQueueMessage | AddToQueueMessage;


// Messages sent via RelayMessage
interface RTCStartMessage {
    action: 'rtc-start';
    sdp: any;
}

interface RTCResponseMessage {
    action: 'rtc-response';
    sdp: any;
}

interface ICECandidateMessage {
    action: 'new-ice-candidate';
    candidate: any;
}

type ICEMessage = RTCStartMessage | RTCResponseMessage | ICECandidateMessage;
type RelayedMessage = ICEMessage;


interface SangNotesMessage {
    action: 'sangNotes';
    notes: {time: number, note: number}[];
    score: number;
}

interface LoadTrackMessage {
    action: 'loadTrack';
    track: number;
}

interface ReadyMessage {
    action: 'readyToGo';
    part: number;
}

interface TrackLoadedMessage {
    action: 'trackLoaded';
}

interface StartGameMessage {
    action: 'startGame';
    time: number;
}

type GameMessage = SangNotesMessage | LoadTrackMessage | ReadyMessage | TrackLoadedMessage | StartGameMessage;

// P2P maintenance messages
interface PingMessage {
    action: 'ping';
    time: number;
}

interface PongMessage {
    action: 'pong';
    time: number;
}

type NetworkingMessage = PingMessage | PongMessage

type AnyMessage = WebsocketMessage | RelayedMessage | GameMessage | NetworkingMessage;

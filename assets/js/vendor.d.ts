interface Window {
    AudioContext?: AudioContext;
    webkitAudioContext?: AudioContext;
    chrome?: any;

    AnalyserNode: {new(): AnalyserNode};
    Promise: {new(): Promise<any>};
}

interface CanvasRenderingContext2D {
    webkitBackingStorePixelRatio?: number;
    mozBackingStorePixelRatio?: number;
    msBackingStorePixelRatio?: number;
    oBackingStorePixelRatio?: number;
    backingStorePixelRatio?: number;
}

declare module "clusterize.js" {
    class Clusterize {
        constructor(options: Clusterize.Options);
        destroy(clean?: boolean): void;
        refresh(force?: boolean): void;
        clear(): void;
        getRowsAmount(): number;
        getScrollProgress(): number;
        update(data?: string[]): void;
        append(rows: string[]): void;
        prepend(rows: string[]): void;
    }

    namespace Clusterize {
        interface Options {
            scrollId?: string;
            contentId?: string;
            scrollElem?: HTMLElement;
            contentElem?: HTMLElement;
            rows?: string[];
            tag?: string;
            rows_in_block?: number;
            blocks_in_cluster?: number;
            show_no_data_row?: boolean;
            no_data_text?: string;
            no_data_class?: string;
            keep_parity?: boolean;
            callbacks?: Callbacks;
        }

        interface Callbacks {
            clusterWillChange?(cb: () => void): void;
            clusterChanged?(cb: () => void): void;
            scrollingProgress?(cb: (progress: number) => void): void;
        }
    }

    export = Clusterize;
}


declare module "reconnecting-websocket" {
    interface ReconnectingWebSocketOptions {
        debug?: boolean;
        automaticOpen?: boolean;
        reconnectInterval?: number;
        maxReconnectInterval?: number;
        reconnectDecay?: number;
        timeoutInterval?: number;
        maxReconnectAttempts?: number;
        binaryType?: 'blob' | 'arraybuffer';
    }

    class ReconnectingWebSocket extends WebSocket {
        constructor(url: string, protocols?: string | string[], options?: ReconnectingWebSocketOptions);
    }
}


declare module "django-channels" {
    import {ReconnectingWebSocket, ReconnectingWebSocketOptions} from "reconnecting-websocket";

    interface Stream {
        send(action: any): void;
    }

    type ChannelCallback = (action: any, stream: string) => void;

    class WebSocketBridge {
        socket: ReconnectingWebSocket;

        constructor();
        connect(url?: string, protocols?: string[] | string, options?: ReconnectingWebSocketOptions): void;
        listen(cb: ChannelCallback): void;
        demultiplex(stream: string, cb: ChannelCallback): void;
        send(msg: any): void;
        stream(stream: string): Stream;
    }
}

declare module "events" {
    namespace internal {
        export class EventEmitter {
            static listenerCount(emitter: EventEmitter, event: string | symbol): number; // deprecated
            static defaultMaxListeners: number;

            addListener(event: string | symbol, listener: (...args: any[]) => void): this;
            on(event: string | symbol, listener: (...args: any[]) => void): this;
            once(event: string | symbol, listener: (...args: any[]) => void): this;
            prependListener(event: string | symbol, listener: (...args: any[]) => void): this;
            prependOnceListener(event: string | symbol, listener: (...args: any[]) => void): this;
            removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
            removeAllListeners(event?: string | symbol): this;
            setMaxListeners(n: number): this;
            getMaxListeners(): number;
            listeners(event: string | symbol): Function[];
            emit(event: string | symbol, ...args: any[]): boolean;
            eventNames(): Array<string | symbol>;
            listenerCount(type: string | symbol): number;
        }
    }

    export = internal;
}

declare module "page-data" {
    const partyID: string;
    const turnAuth: {username: string, password: string};
}

declare module "*.css" {
    const css: string;
    export default css;
}

declare module "*.png" {
    const png: string;
    export default png;
}

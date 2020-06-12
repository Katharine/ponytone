export class NickPrompt {
    private resolve: (nick: string) => void;
    private nickInput: HTMLInputElement;
    private useVideoInput: HTMLInputElement;

    constructor() {
        this.resolve = null;
        this.nickInput = <HTMLInputElement>document.getElementById('nick-input');
        this.useVideoInput = <HTMLInputElement>document.getElementById('use-video-input');
        if (localStorage['nick']) {
            this.nickInput.value = localStorage['nick'];
        }
        if (localStorage['useVideo']) {
            this.useVideoInput.checked = localStorage['useVideo'];
        }
    }
    prompt(): Promise<string> {
        document.getElementById('nick-confirm-button').onclick = () => this._handleNick();
        this.nickInput.onkeydown = (e) => {
            if (e.keyCode === 13) {
                this._handleNick();
            }
        };
        return new Promise((resolve, reject) => {
            this.resolve = resolve;
        });
    }

    _handleNick(): void {
        let nick = this.nickInput.value;
        let useVideo = this.useVideoInput.checked;
        if (nick !== '') {
            document.getElementById('nick-container').style.display = 'none';
            localStorage['nick'] = nick;
            localStorage['useVideo'] = useVideo;
            this.resolve(nick);
            this.resolve = null;
        }
    }
}

export class NickPrompt {
    constructor() {
        this.resolve = null;
        if (localStorage['nick']) {
            document.getElementById('nick-input').value = localStorage['nick'];
        }
    }
    prompt() {
        document.getElementById('nick-confirm-button').onclick = () => this._handleNick();
        document.getElementById('nick-input').onkeydown = (e) => {
            if (e.keyCode === 13) {
                this._handleNick();
            }
        };
        return new Promise((resolve, reject) => {
            this.resolve = resolve;
        });
    }

    _handleNick() {
        let nick = document.getElementById('nick-input').value;
        if (nick !== '') {
            document.getElementById('nick-container').style.display = 'none';
            localStorage['nick'] = nick;
            this.resolve(nick);
            this.resolve = null;
        }
    }
}

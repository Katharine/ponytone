export class NickPrompt {
    prompt() {
        return new Promise((resolve, reject) => {
            let nick = prompt("Enter a nickname", localStorage['nickname'] || '');
            localStorage['nickname'] = nick;
            resolve(nick);
        });
    }
}

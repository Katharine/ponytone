import escapeHtml from 'escape-html';

export class PartyList {
    constructor(container, party) {
        this.container = container;
        this.party = party;
    }

    update() {
        let container = this.container;
        container.innerHTML = '';
        console.log(this.party.party);
        for (let [channel, member] of Object.entries(this.party.party)) {
            let div = document.createElement('div');
            let html = `<div class="middle"><div class="name">${escapeHtml(member.nick)}</div>`;
            if (member.score !== null) {
                html += `<div class="score">Score: ${member.score.toLocaleString()}</div>`;
            }
            html += `</div>`;
            div.innerHTML = html;
            div.dataset.channel = channel;
            container.appendChild(div);
        }
        // this.container.innerHTML = '';
        // for(let member of Object.values(this.party.party)) {
        //     let li = document.createElement('li');
        //     let status = '';
        //     if (member.ready) {
        //         status = 'ready';
        //     } else if (member.data || member.me) {
        //         status = 'waiting';
        //     } else {
        //         status = 'connecting';
        //     }
        //     if (member.ping !== null) {
        //         status += ` - ping: ${member.ping}ms`;
        //     } else if (member.me) {
        //         status += ' - me!';
        //     } else {
        //     }
        //     li.appendChild(document.createTextNode(`${member.nick} (${status})`));
        //     ul.appendChild(li);
        // }
    }
}

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
            let classList = [];
            if (member.ready) {
                classList.push('ready');
            } else if(member.data || member.me) {
                classList.push('waiting');
            } else {
                classList.push('connecting');
            }
            div.classList = classList;
            let html = `<div class="middle"><div class="name">${escapeHtml(member.nick)}</div>`;
            if (member.score !== null) {
                html += `<div class="score">Score: ${member.score.toLocaleString()}</div>`;
            }
            html += `</div>`;
            div.innerHTML = html;
            div.dataset.channel = channel;
            container.appendChild(div);
        }
    }
}

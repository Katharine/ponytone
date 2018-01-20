import * as escapeHtml from 'escape-html';
import {Party} from "./party";

export class PartyList {
    private container: HTMLElement;
    private party: Party;

    constructor(container: HTMLElement, party: Party) {
        this.container = container;
        this.party = party;
    }

    update() {
        let container = this.container;
        container.innerHTML = '';
        console.log(this.party.party);
        for (let [channel, member] of Object.entries(this.party.party)) {
            let div = document.createElement('div');
            div.className = '';
            if (member.ready) {
                div.classList.add('ready');
            } else if(member.data || member.me) {
                div.classList.add('waiting');
            } else {
                div.classList.add('connecting');
            }
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

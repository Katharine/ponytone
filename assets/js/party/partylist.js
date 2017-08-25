export class PartyList {
    constructor(container, party) {
        this.container = container;
        this.party = party;
    }

    update() {
        let ul = this.container;
        this.container.innerHTML = '';
        for(let member of Object.values(this.party.party)) {
            let li = document.createElement('li');
            let status = '';
            if (member.ready) {
                status = 'ready';
            } else if (member.data || member.me) {
                status = 'waiting';
            } else {
                status = 'connecting';
            }
            if (member.ping !== null) {
                status += ` - ping: ${member.ping}ms`;
            } else if (member.me) {
                status += ' - me!';
            } else {
            }
            li.appendChild(document.createTextNode(`${member.nick} (${status})`));
            ul.appendChild(li);
        }
    }
}

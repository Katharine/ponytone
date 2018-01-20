import * as Cookies from "js-cookie";
import {isCompatible} from "./lib/compat";

import "../css/index.css";
import ponytones from "../img/ponytones.png";

window.addEventListener('DOMContentLoaded', () => {
    let img = <HTMLImageElement>document.getElementById('ponytone-image');
    if (img) {
        img.src = ponytones;
        if (isCompatible()) {
            document.getElementById('partybutton').onclick = () => createParty();
        } else {
            (<HTMLElement>document.getElementById('partybutton').parentNode).innerHTML = `
            <p>Unfortunately, your browser is not supported. Try <a href="https://chrome.google.com">Google Chrome</a>.
            `
        }
    }
});

async function createParty() {
    let request = await fetch("/party/create", {
        method: "POST",
        headers: new Headers({"X-CSRFToken": Cookies.get("csrftoken")}),
        credentials: "same-origin",
    });
    let text = await request.text();
    document.getElementById('overlay').style.display = 'block';
    let a = <HTMLAnchorElement>document.getElementById('targetlink');
    a.href += text;
    a.innerHTML += text;
    document.getElementById('beginbutton').onclick = () => location.href = a.href;
}

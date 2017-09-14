import Cookies from "js-cookie";
import {isCompatible} from "./lib/compat";

import css from "../css/index.css";
import ponytones from "../img/ponytones.png";

window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('ponytone-image')) {
        document.getElementById('ponytone-image').src = ponytones;
        if (isCompatible()) {
            document.getElementById('partybutton').onclick = () => createParty();
        } else {
            document.getElementById('partybutton').parentNode.innerHTML = `
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
    let a = document.getElementById('targetlink');
    a.href += text;
    a.innerHTML += text;
    document.getElementById('beginbutton').onclick = () => location.href = a.href;
}

import Cookies from "js-cookie";

import css from "../css/index.css";
import ponytones from "../img/ponytones.png";

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ponytone-image').src = ponytones;
    document.getElementById('partybutton').onclick = () => createParty();
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

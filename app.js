
import { db } from "./firebase.js";

import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const loginPage = document.getElementById("loginPage");
const chatPage = document.getElementById("chatPage");

const joinBtn = document.getElementById("joinBtn");
const sendBtn = document.getElementById("sendBtn");

const nameInput = document.getElementById("name");
const roomInput = document.getElementById("room");
const msgInput = document.getElementById("msg");

const messages = document.getElementById("messages");
const roomName = document.getElementById("roomName");

let username = "";
let room = "";

msgInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendBtn.click();
  }
});

joinBtn.onclick = () => {
    username = nameInput.value.trim();
    room = roomInput.value.trim();

const allowedUsers = ["Onkar", "Urmila"];

if (!allowedUsers.includes(username)) {
    alert("❌ Access Denied");
    return;
}

    if (!username || !room) {
        alert("Enter nickname and room code");
        return;
    }

    loginPage.style.display = "none";
    chatPage.style.display = "block";

    roomName.innerText = room;

    loadMessages();
};

sendBtn.onclick = async () => {

    if (msgInput.value.trim() === "") return;

    await addDoc(collection(db, "rooms", room, "messages"), {

        name: username,
        text: msgInput.value,
        createdAt: serverTimestamp()

    });

    msgInput.value = "";

};

function loadMessages() {

    const q = query(
        collection(db, "rooms", room, "messages"),
        orderBy("createdAt")
    );

    onSnapshot(q, (snapshot) => {

        messages.innerHTML = "";

        snapshot.forEach((doc) => {

            const data = doc.data();

            messages.innerHTML += `
            <div class="msg">
                <div class="name">${data.name}</div>
                <div>${data.text}</div>
            </div>
            `;

        });

        messages.lastElementChild?.scrollIntoView({
            behavior: "smooth"
        });

    });

}

import {
  db, auth, storage,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  updateProfile, onAuthStateChanged, signOut,
  ref, uploadBytes, getDownloadURL
} from "./firebase.js";

import {
  collection,
  addDoc,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  arrayUnion,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// This is a fixed private room shared only by Onkar & Urmila.
// No room code needed since it's always just the two of them.
const ROOM = "onkar-urmila-secret-room";

// ---------- Elements ----------
const loginPage = document.getElementById("loginPage");
const chatPage = document.getElementById("chatPage");

const usernameSelect = document.getElementById("username");
const passwordInput = document.getElementById("password");
const authError = document.getElementById("authError");

const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const logoutBtn = document.getElementById("logoutBtn");

const sendBtn = document.getElementById("sendBtn");
const emojiBtn = document.getElementById("emojiBtn");
const emojiPanel = document.getElementById("emojiPanel");
const imageInput = document.getElementById("imageInput");

const msgInput = document.getElementById("msg");
const messages = document.getElementById("messages");
const onlineStatus = document.getElementById("onlineStatus");
const typingIndicator = document.getElementById("typingIndicator");
const peerAvatar = document.getElementById("peerAvatar");

// ---------- State ----------
let username = "";
let uid = null;
let firstLoad = true;
let isTyping = false;
let typingTimeout = null;
let unsubMessages = null;
let unsubPresence = null;
let unsubTyping = null;
let heartbeatInterval = null;

// BUGFIX: this flag prevents the login/signup click handler AND the
// onAuthStateChanged listener from both trying to enter the chat at the
// same time (previously this race could leave the user stuck on the
// login screen after signing up).
let handledManually = false;

const AUTO_DELETE_MS = 24 * 60 * 60 * 1000; // messages auto-delete after 24h
const PRESENCE_TIMEOUT_MS = 20 * 1000;

function usernameToEmail(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "") + "@secretchat.local";
}

function showAuthError(msg) {
  authError.innerText = msg;
}

// ---------- Signup ----------
signupBtn.onclick = async () => {
  handledManually = true; // set BEFORE any await, closes the race window

  const name = usernameSelect.value;
  const pass = passwordInput.value;

  if (!pass) {
    showAuthError("Password bharein");
    return;
  }
  if (pass.length < 6) {
    showAuthError("Password kam se kam 6 characters ka ho");
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(name), pass);
    await updateProfile(cred.user, { displayName: name });
    uid = cred.user.uid;
    username = name;
    enterChat();
  } catch (err) {
    handledManually = false;
    showAuthError(friendlyAuthError(err));
  }
};

// ---------- Login ----------
loginBtn.onclick = async () => {
  handledManually = true;

  const name = usernameSelect.value;
  const pass = passwordInput.value;

  if (!pass) {
    showAuthError("Password bharein");
    return;
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, usernameToEmail(name), pass);
    uid = cred.user.uid;
    username = name;
    enterChat();
  } catch (err) {
    handledManually = false;
    showAuthError(friendlyAuthError(err));
  }
};

function friendlyAuthError(err) {
  const code = err.code || "";
  if (code.includes("email-already-in-use")) return "Ye account pehle se bana hua hai, Login try karein";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Password galat hai";
  if (code.includes("weak-password")) return "Password kam se kam 6 characters ka ho";
  return "Kuch gadbad ho gayi: " + code;
}

// Handles page refresh: if the browser still has an active Firebase
// session, skip the login screen entirely.
onAuthStateChanged(auth, (user) => {
  if (user && !handledManually) {
    uid = user.uid;
    username = user.displayName || usernameSelect.value;
    handledManually = true;
    enterChat();
  }
  if (!user) {
    handledManually = false;
  }
});

function enterChat() {
  loginPage.style.display = "none";
  chatPage.style.display = "block";
  firstLoad = true;

  const peer = username === "Onkar" ? "Urmila" : "Onkar";
  peerAvatar.innerText = peer.charAt(0);

  loadMessages();
  setupPresence();
  setupTyping();
}

logoutBtn.onclick = async () => {
  cleanupListeners();
  try {
    await deleteDoc(doc(db, "rooms", ROOM, "presence", uid));
  } catch (e) { /* ignore */ }
  await signOut(auth);
  handledManually = false;
  chatPage.style.display = "none";
  loginPage.style.display = "block";
  passwordInput.value = "";
  authError.innerText = "";
};

function cleanupListeners() {
  if (unsubMessages) unsubMessages();
  if (unsubPresence) unsubPresence();
  if (unsubTyping) unsubTyping();
  if (heartbeatInterval) clearInterval(heartbeatInterval);
}

// ---------- Sending messages ----------
msgInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendBtn.click();
});

msgInput.addEventListener("input", () => {
  updateTypingStatus();
});

sendBtn.onclick = async () => {
  const text = msgInput.value.trim();
  if (text === "") return;

  await addDoc(collection(db, "rooms", ROOM, "messages"), {
    name: username,
    text: text,
    imageURL: null,
    uid: uid,
    seenBy: [],
    createdAt: serverTimestamp(),
    expiresAt: Date.now() + AUTO_DELETE_MS
  });

  msgInput.value = "";
  emojiPanel.style.display = "none";
  clearTypingStatus();
};

// ---------- Image sharing ----------
imageInput.addEventListener("change", async () => {
  const file = imageInput.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert("Image 5MB se choti honi chahiye");
    imageInput.value = "";
    return;
  }

  sendBtn.disabled = true;

  try {
    const path = `images/${ROOM}/${Date.now()}_${uid}_${file.name}`;
    const imgRef = ref(storage, path);
    await uploadBytes(imgRef, file);
    const url = await getDownloadURL(imgRef);

    await addDoc(collection(db, "rooms", ROOM, "messages"), {
      name: username,
      text: "",
      imageURL: url,
      uid: uid,
      seenBy: [],
      createdAt: serverTimestamp(),
      expiresAt: Date.now() + AUTO_DELETE_MS
    });
  } catch (err) {
    console.error(err);
    alert("Image bhejne mein dikkat aayi");
  }

  sendBtn.disabled = false;
  imageInput.value = "";
});

// ---------- Messages listener ----------
function loadMessages() {
  const q = query(
    collection(db, "rooms", ROOM, "messages"),
    orderBy("createdAt")
  );

  unsubMessages = onSnapshot(q, (snapshot) => {
    const now = Date.now();

    // BUGFIX: previously the notification sound was triggered by looping
    // over the *entire* snapshot every time anything changed (e.g. a
    // "seen" tick update), which replayed the beep for old messages too.
    // docChanges() only gives us genuinely NEW messages.
    if (!firstLoad) {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" && change.doc.data().uid !== uid) {
          playNotifySound();
        }
      });
    }

    messages.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();

      // Auto-delete expired messages (best-effort cleanup)
      if (data.expiresAt && data.expiresAt < now) {
        deleteDoc(doc(db, "rooms", ROOM, "messages", docSnap.id)).catch(() => {});
        return;
      }

      const isOwn = uid && data.uid === uid;

      if (!isOwn && uid && !(data.seenBy || []).includes(uid)) {
        updateDoc(doc(db, "rooms", ROOM, "messages", docSnap.id), {
          seenBy: arrayUnion(uid)
        }).catch(() => {});
      }

      const bubble = document.createElement("div");
      bubble.className = "msg " + (isOwn ? "own" : "other");

      let inner = "";

      if (data.imageURL) {
        inner += `<img src="${data.imageURL}" class="chat-image" alt="image">`;
      }
      if (data.text) {
        inner += `<div class="msg-text">${escapeHtml(data.text)}</div>`;
      }

      const time = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";

      let meta = `<span class="msg-time">${time}</span>`;
      if (isOwn) {
        const seenByOthers = (data.seenBy || []).filter(id => id !== uid);
        meta += seenByOthers.length > 0
          ? `<span class="tick seen">✔✔</span>`
          : `<span class="tick sent">✔</span>`;
      }
      inner += `<div class="msg-meta">${meta}</div>`;

      bubble.innerHTML = inner;
      messages.appendChild(bubble);
    });

    messages.lastElementChild?.scrollIntoView({ behavior: "smooth" });
    firstLoad = false;
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.innerText = str;
  return div.innerHTML;
}

// ---------- Presence (online status) ----------
function setupPresence() {
  const presenceRef = doc(db, "rooms", ROOM, "presence", uid);

  const beat = () => setDoc(presenceRef, {
    name: username,
    lastSeen: serverTimestamp()
  }).catch(() => {});

  beat();
  heartbeatInterval = setInterval(beat, 10000);

  window.addEventListener("beforeunload", () => {
    deleteDoc(presenceRef).catch(() => {});
  });

  const presenceQuery = collection(db, "rooms", ROOM, "presence");
  unsubPresence = onSnapshot(presenceQuery, (snapshot) => {
    const now = Date.now();
    let peerOnline = false;

    snapshot.forEach((docSnap) => {
      if (docSnap.id === uid) return; // skip self
      const data = docSnap.data();
      const lastSeenMs = data.lastSeen?.toMillis ? data.lastSeen.toMillis() : now;
      if (now - lastSeenMs < PRESENCE_TIMEOUT_MS) peerOnline = true;
    });

    onlineStatus.innerText = peerOnline ? "🟢 Online" : "Offline";
  });
}

// ---------- Typing indicator ----------
function setupTyping() {
  const typingQuery = collection(db, "rooms", ROOM, "typing");
  unsubTyping = onSnapshot(typingQuery, (snapshot) => {
    const now = Date.now();
    let peerTyping = false;
    let peerName = "";

    snapshot.forEach((docSnap) => {
      if (docSnap.id === uid) return;
      const data = docSnap.data();
      const updatedMs = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : 0;
      if (now - updatedMs < 3000) {
        peerTyping = true;
        peerName = data.name;
      }
    });

    typingIndicator.innerText = peerTyping ? `✍️ ${peerName} is typing...` : "\u00A0";
  });
}

// BUGFIX: previously this wrote to Firestore on EVERY single keystroke.
// Now it only writes once when typing starts, and again after the
// cooldown expires, which cuts down writes a lot.
function updateTypingStatus() {
  const typingRef = doc(db, "rooms", ROOM, "typing", uid);

  if (!isTyping) {
    isTyping = true;
    setDoc(typingRef, { name: username, updatedAt: serverTimestamp() }).catch(() => {});
  }

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
    deleteDoc(typingRef).catch(() => {});
  }, 2000);
}

function clearTypingStatus() {
  isTyping = false;
  clearTimeout(typingTimeout);
  deleteDoc(doc(db, "rooms", ROOM, "typing", uid)).catch(() => {});
}

// ---------- Notification sound (generated beep, no file needed) ----------
function playNotifySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) { /* ignore audio errors */ }
}

// ---------- Emoji Picker ----------
const EMOJIS = ["😀","😂","😍","😎","😢","😡","👍","👎","🙏","🔥","🎉","❤️","😅","🤔","😴","👋","💯","😜","🥳","😭"];

function buildEmojiPanel() {
  emojiPanel.innerHTML = "";
  EMOJIS.forEach((emoji) => {
    const span = document.createElement("span");
    span.className = "emoji-item";
    span.innerText = emoji;
    span.onclick = () => {
      msgInput.value += emoji;
      msgInput.focus();
    };
    emojiPanel.appendChild(span);
  });
}
buildEmojiPanel();

emojiBtn.onclick = () => {
  emojiPanel.style.display = emojiPanel.style.display === "grid" ? "none" : "grid";
};

document.addEventListener("click", (e) => {
  if (!emojiPanel.contains(e.target) && e.target !== emojiBtn) {
    emojiPanel.style.display = "none";
  }
});

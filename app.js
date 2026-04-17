// ============================================================
//  THE BANGLADESH PROJECT — app.js  (v3)
// ============================================================

// ── Tags ─────────────────────────────────────────────────────
const TAGS = [
  { id: "harassment",     label: "Harassment",            emoji: "😡" },
  { id: "scam",           label: "Scam / Fraud",          emoji: "💰" },
  { id: "misinformation", label: "Misinformation",        emoji: "❌" },
  { id: "inappropriate",  label: "Inappropriate Content", emoji: "⚠️" },
  { id: "threats",        label: "Threats",               emoji: "🔴" },
  { id: "privacy",        label: "Privacy Violation",     emoji: "🔒" },
  { id: "other",          label: "Other",                 emoji: "📋" },
];

// ── Dark mode (runs immediately to prevent flash) ─────────────
function applyTheme() {
  const saved = localStorage.getItem("tbp-theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = saved === "dark" ? "☀️" : "🌙";
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("tbp-theme", next);
  document.querySelectorAll(".theme-toggle-btn").forEach(btn => {
    btn.textContent = next === "dark" ? "☀️" : "🌙";
  });
}
// Apply immediately
(function() {
  const saved = localStorage.getItem("tbp-theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
})();

// ── Firebase Config ──────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAw397cFFvs2nMTiz1hj1pbAGxd83xnfco",
  authDomain: "thebangladeshproject0.firebaseapp.com",
  projectId: "thebangladeshproject0",
  storageBucket: "thebangladeshproject0.firebasestorage.app",
  messagingSenderId: "366972587357",
  appId: "1:366972587357:web:d330a3637b26808ad62cb4"
};

firebase.initializeApp(firebaseConfig);
const db   = firebase.firestore();
const auth = firebase.auth();
const postsCol = db.collection("posts");

// ── Firestore Helpers ────────────────────────────────────────

/** Add a new post (pending by default) */
async function addPost({ name, image, comment, commentImage = "", postLink = "", profileLink = "", tag = "" }) {
  return postsCol.add({
    name:         name.trim(),
    nameLower:    name.trim().toLowerCase(),
    image:        image.trim(),
    comment:      comment.trim(),
    commentImage: commentImage.trim(),
    postLink:     postLink.trim(),
    profileLink:  profileLink.trim(),
    tag:          tag,
    status:       "pending",
    timestamp:    firebase.firestore.FieldValue.serverTimestamp(),
    reports:      0,
    commentCount: 0
  });
}

async function approvePost(id) {
  return postsCol.doc(id).update({ status: "approved" });
}

async function deletePost(id) {
  return postsCol.doc(id).delete();
}

async function updatePost(id, fields) {
  return postsCol.doc(id).update(fields);
}

/** Increments report count; flags post if ≥ 10 reports */
async function reportPost(id) {
  return db.runTransaction(async t => {
    const ref  = postsCol.doc(id);
    const snap = await t.get(ref);
    const data = snap.data();
    const newReports = (data.reports || 0) + 1;
    const updates = { reports: newReports };
    if (newReports >= 10 && data.status === "approved") {
      updates.status = "flagged";
    }
    t.update(ref, updates);
  });
}

// ── Sort helper ───────────────────────────────────────────────
/** Sort a Firestore snapshot newest-first and return a compatible object */
function sortedSnap(snap) {
  const docs = [];
  snap.forEach(doc => docs.push(doc));
  docs.sort((a, b) => (b.data().timestamp?.seconds || 0) - (a.data().timestamp?.seconds || 0));
  return {
    size:    docs.length,
    empty:   docs.length === 0,
    forEach: cb => docs.forEach(cb)
  };
}

// ── Realtime Subscriptions ────────────────────────────────────

function subscribeApprovedFeed(callback) {
  return postsCol
    .where("status", "==", "approved")
    .onSnapshot(
      snap => callback(sortedSnap(snap)),
      err  => console.error("Feed error:", err)
    );
}

function subscribeApprovedByTag(tag, callback) {
  return postsCol
    .where("status", "==", "approved")
    .where("tag", "==", tag)
    .onSnapshot(
      snap => callback(sortedSnap(snap)),
      err  => console.error("Tag feed error:", err)
    );
}

async function getNamesByLetter(letter) {
  const lo = letter.toLowerCase();
  const hi = lo + "\uf8ff";
  const snap = await postsCol
    .where("status", "==", "approved")
    .where("nameLower", ">=", lo)
    .where("nameLower", "<", hi)
    .get();
  const names = new Set();
  snap.forEach(doc => names.add(doc.data().name));
  return [...names].sort((a, b) => a.localeCompare(b));
}

function subscribePostsByName(name, callback) {
  return postsCol
    .where("status", "==", "approved")
    .where("name", "==", name)
    .onSnapshot(snap => {
      const sorted = [];
      snap.forEach(doc => sorted.push({ id: doc.id, data: doc.data() }));
      sorted.sort((a, b) => (b.data.timestamp?.seconds || 0) - (a.data.timestamp?.seconds || 0));
      callback({ empty: sorted.length === 0, forEach: cb => sorted.forEach(x => cb({ id: x.id, data: () => x.data })) });
    });
}

// ── Admin Subscriptions ───────────────────────────────────────
function subscribePendingPosts(callback) {
  return postsCol
    .where("status", "==", "pending")
    .onSnapshot(snap => callback(sortedSnap(snap)));
}

function subscribeApprovedAdmin(callback) {
  return postsCol
    .where("status", "==", "approved")
    .onSnapshot(snap => callback(sortedSnap(snap)));
}

function subscribeFlaggedPosts(callback) {
  return postsCol
    .where("status", "==", "flagged")
    .onSnapshot(
      snap => callback(sortedSnap(snap)),
      err  => console.error("Flagged error:", err)
    );
}

// ── Auth ──────────────────────────────────────────────────────
function signIn(email, password) { return auth.signInWithEmailAndPassword(email, password); }
function signOut()                { return auth.signOut(); }
function onAuthChange(cb)         { return auth.onAuthStateChanged(cb); }

/** Google sign-in for public users (commenting) */
function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  return auth.signInWithPopup(provider);
}

// ── Comments ──────────────────────────────────────────────────
function subscribeComments(postId, callback) {
  return db.collection("posts").doc(postId).collection("comments")
    .orderBy("timestamp", "asc")
    .onSnapshot(callback, err => console.error("Comments error:", err));
}

async function addComment(postId, text) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  return db.collection("posts").doc(postId)
    .collection("comments")
    .add({
      text:        text.trim(),
      authorName:  user.displayName || "Anonymous",
      authorPhoto: user.photoURL    || "",
      authorUid:   user.uid,
      timestamp:   firebase.firestore.FieldValue.serverTimestamp()
    });
}

// ── Utilities ─────────────────────────────────────────────────

function formatTime(ts) {
  if (!ts) return "just now";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const now  = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function showToast(msg, duration = 2800) {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const t = document.createElement("div");
  t.className  = "toast";
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast("Link copied!"));
  } else {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    showToast("Link copied!");
  }
}

function getInitial(name) { return (name || "?").trim()[0].toUpperCase(); }

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getTagInfo(tagId) {
  return TAGS.find(t => t.id === tagId) || { id: tagId, label: tagId, emoji: "📌" };
}

/** Build a feed post card element */
function buildCard(id, data) {
  const card = document.createElement("article");
  card.className  = "card";
  card.dataset.id = id;

  const avatarHtml = data.image
    ? `<img class="card-avatar" src="${esc(data.image)}" alt="${esc(data.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : "";
  const placeholderHtml = `<div class="card-avatar-placeholder" style="${data.image ? "display:none" : ""}">${esc(getInitial(data.name))}</div>`;

  const tagInfo = data.tag ? getTagInfo(data.tag) : null;
  const tagHtml = tagInfo
    ? `<span class="tag-badge tag-${esc(tagInfo.id)}">${tagInfo.emoji} ${esc(tagInfo.label)}</span>`
    : "";

  const commentImgHtml = data.commentImage
    ? `<img class="card-image" src="${esc(data.commentImage)}" alt="evidence" loading="lazy" onerror="this.remove()">`
    : "";

  const postLinkHtml = data.postLink
    ? `<a class="card-post-link" href="${esc(data.postLink)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">🔗 ${esc(data.postLink)}</a>`
    : "";

  card.innerHTML = `
    <div class="card-header">
      ${avatarHtml}
      ${placeholderHtml}
      <div class="card-meta">
        <div class="card-name">${esc(data.name)}</div>
        <div class="card-time">${formatTime(data.timestamp)}</div>
      </div>
      ${tagHtml}
    </div>
    <div class="card-comment">${esc(data.comment)}</div>
    ${commentImgHtml}
    ${postLinkHtml}
  `;
  return card;
}

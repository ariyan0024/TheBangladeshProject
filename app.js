// ============================================================
//  THE BANGLADESH PROJECT — app.js
//  Firebase v9 Compat SDK (loaded via CDN in HTML files)
// ============================================================

// ── Firebase Config ─────────────────────────────────────────
// ⚠ Replace with YOUR Firebase project credentials:
//   Firebase Console → Project Settings → Your apps → Web
const firebaseConfig = {
  apiKey: "AIzaSyAw397cFFvs2nMTiz1hj1pbAGxd83xnfco",
  authDomain: "thebangladeshproject0.firebaseapp.com",
  projectId: "thebangladeshproject0",
  storageBucket: "thebangladeshproject0.firebasestorage.app",
  messagingSenderId: "366972587357",
  appId: "1:366972587357:web:d330a3637b26808ad62cb4"
};

// ── Init ────────────────────────────────────────────────────
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Collection reference
const postsCol = db.collection("posts");

// ── Firestore Helpers ────────────────────────────────────────

/** Add a new post (pending by default) */
async function addPost({ name, image, comment, commentImage = "", postLink = "" }) {
  return postsCol.add({
    name: name.trim(),
    nameLower: name.trim().toLowerCase(),
    image: image.trim(),
    comment: comment.trim(),
    commentImage: commentImage.trim(),
    postLink: postLink.trim(),
    status: "pending",
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    reports: 0
  });
}

/** Approve a post */
async function approvePost(id) {
  return postsCol.doc(id).update({ status: "approved" });
}

/** Reject / delete a post */
async function deletePost(id) {
  return postsCol.doc(id).delete();
}

/** Update a post's comment text */
async function updatePost(id, fields) {
  return postsCol.doc(id).update(fields);
}

/** Increment report counter */
async function reportPost(id) {
  return postsCol.doc(id).update({
    reports: firebase.firestore.FieldValue.increment(1)
  });
}

/** Sort a Firestore snapshot newest-first and return a compatible object */
function sortedSnap(snap) {
  const docs = [];
  snap.forEach(doc => docs.push(doc));
  docs.sort((a, b) => (b.data().timestamp?.seconds || 0) - (a.data().timestamp?.seconds || 0));
  return {
    size: docs.length,
    empty: docs.length === 0,
    forEach: cb => docs.forEach(cb)
  };
}

// ── Realtime Feed (approved, newest first — sorted client-side) ───────────────
function subscribeApprovedFeed(callback) {
  return postsCol
    .where("status", "==", "approved")
    .onSnapshot(
      snap => callback(sortedSnap(snap)),
      err  => console.error("Feed error:", err)
    );
}

// ── A–Z Directory ─────────────────────────────────────────────
async function getNamesByLetter(letter) {
  const lo = letter.toLowerCase();
  const hi = lo + "\uf8ff";
  const snap = await postsCol
    .where("status", "==", "approved")
    .where("nameLower", ">=", lo)
    .where("nameLower", "<", hi)
    .get();
  // Return unique names
  const names = new Set();
  snap.forEach(doc => names.add(doc.data().name));
  return [...names].sort((a, b) => a.localeCompare(b));
}

function subscribePostsByName(name, callback) {
  // No orderBy here to avoid needing an extra composite index — sort client-side
  return postsCol
    .where("status", "==", "approved")
    .where("name", "==", name)
    .onSnapshot(snap => {
      // Sort newest first client-side
      const sorted = [];
      snap.forEach(doc => sorted.push({ id: doc.id, data: doc.data() }));
      sorted.sort((a, b) => (b.data.timestamp?.seconds || 0) - (a.data.timestamp?.seconds || 0));
      callback({ empty: sorted.length === 0, forEach: cb => sorted.forEach(x => cb({ id: x.id, data: () => x.data })) });
    });
}

// ── Admin Queries (no orderBy → no extra index needed, sort client-side) ─────
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


// ── Auth ──────────────────────────────────────────────────────
function signIn(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}
function signOut() { return auth.signOut(); }
function onAuthChange(cb) { return auth.onAuthStateChanged(cb); }

// ── Utilities ─────────────────────────────────────────────────

/** Format Firestore timestamp to readable string */
function formatTime(ts) {
  if (!ts) return "just now";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Show a transient toast notification */
function showToast(msg, duration = 2800) {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

/** Copy text to clipboard */
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

/** Initials avatar fallback */
function getInitial(name) {
  return (name || "?").trim()[0].toUpperCase();
}

/** Escape HTML to prevent XSS */
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build a single post card element */
function buildCard(id, data) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = id;

  const avatarHtml = data.image
    ? `<img class="card-avatar" src="${esc(data.image)}" alt="${esc(data.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : "";
  const placeholderHtml = `<div class="card-avatar-placeholder" style="${data.image ? "display:none" : ""}"> ${esc(getInitial(data.name))}</div>`;

  const commentImgHtml = data.commentImage
    ? `<img class="card-image" src="${esc(data.commentImage)}" alt="comment image" loading="lazy" onerror="this.remove()">`
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
    </div>
    <div class="card-comment">${esc(data.comment)}</div>
    ${commentImgHtml}
    ${postLinkHtml}
  `;
  return card;
}

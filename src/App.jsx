import { useState, useEffect, useRef } from "react";
import "./App.css";

const cardoLink = document.createElement("link");
cardoLink.rel = "stylesheet";
cardoLink.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Cardo:ital,wght@0,400;0,700;1,400&display=swap";
document.head.appendChild(cardoLink);

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwrsP-Nnq_hp5QWWks6BA5ZnuS2B9E_KQyFskRQC0PSehb6NcspJhyO4wlqD3-VfsEwxg/exec";
const INITIAL_MEMBERS = ["Ken", "Wyn", "Paula", "Rick", "Jeff", "Rich"];
const GOLD = "#886c44";
const CREAM = "#fdfbf8";
const OPEN = "'Manrope', Tahoma, sans-serif";
const SERIF = "'Cardo', Georgia, serif";
const APP_MAX_WIDTH = 780;

function useLS(key, def) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}

function isClosed(t) {
  if (t.closed) return true;
  if (t.dueDate && new Date() > new Date(t.dueDate)) return true;
  if (Object.keys(t.votes || {}).length >= (t.totalMembers || 6)) return true;
  return false;
}

function fmtDate(iso) {
  if (!iso) return "No due date";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "No due date";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const CHOICE_COLOR = { Yes: "#1a7a1a", No: "#c0392b", Abstain: "#666" };

async function api(payload) {
  const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Bad response: " + text.slice(0, 200)); }
  if (data.error) throw new Error(data.error);
  return data;
}

function renderText(text) {
  if (!text) return null;
  const result = [];
  text.split(/(\*\*[\s\S]+?\*\*|\*[\s\S]+?\*)/g).forEach((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      result.push(<strong key={i}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("*") && part.endsWith("*")) {
      result.push(<em key={i}>{part.slice(1, -1)}</em>);
    } else {
      part.split('\n').forEach((line, j) => {
        if (j > 0) result.push(<br key={`${i}-${j}`} />);
        result.push(line);
      });
    }
  });
  return result;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [members, setMembers] = useState(INITIAL_MEMBERS);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState("home");
  const [selId, setSelId] = useState(null);
  const [form, setForm] = useState({ title: "", description: "", submittedBy: "", dueDate: "", fileUrl: "", fileName: "" });
  const [voteForm, setVoteForm] = useState({ voter: "", choice: "", note: "" });
  const [newMember, setNewMember] = useState("");
  const [toast, setToast] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("idle");
  const descRef = useRef(null);

  function htmlToMd(html) {
    return html
      .replace(/<(strong|b)>([\s\S]*?)<\/(strong|b)>/gi, '**$2**')
      .replace(/<(em|i)>([\s\S]*?)<\/(em|i)>/gi, '*$2*')
      .replace(/<div><br\s*\/?><\/div>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<div>/gi, '\n').replace(/<\/div>/gi, '')
      .replace(/<[^>]+>/g, '');
  }

  function mdToHtml(md) {
    return md
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function applyFormat(cmd) {
    descRef.current.focus();
    document.execCommand(cmd, false, null);
  }

  function toast_(msg) { setToast(msg); setTimeout(() => setToast(null), 6000); }

  async function loadTopics() {
    try {
      const data = await api({ action: "getTopics" });
      setTopics(data.topics || []);
    } catch (err) {
      toast_(err.message || "Failed to load topics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTopics();
    const interval = setInterval(loadTopics, 30000);
    return () => clearInterval(interval);
  }, []);

  async function submitTopic() {
    if (!form.title.trim()) return;
    setSyncing(true);
    try {
      const description = htmlToMd(descRef.current?.innerHTML || "").trim();
      await api({
        action: "addTopic",
        title: form.title.trim(),
        description,
        submittedBy: form.submittedBy.trim(),
        dueDate: form.dueDate,
        totalMembers: members.length,
        fileUrl: form.fileUrl || "",
        fileName: form.fileName || "",
      });
      setForm({ title: "", description: "", submittedBy: "", dueDate: "", fileUrl: "", fileName: "" });
      if (descRef.current) descRef.current.innerHTML = "";
      setUploadStatus("idle");
      setView("home");
      toast_("Topic added.");
      loadTopics();
    } catch (err) {
      toast_(err.message || "Failed to add topic.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadStatus("uploading");
    try {
      const dataUrl = await fileToBase64(file);
      const base64 = dataUrl.split(",")[1];
      const result = await api({ action: "uploadFile", fileName: file.name, fileData: base64, mimeType: file.type || "application/octet-stream" });
      setForm(p => ({ ...p, fileUrl: result.url, fileName: result.name }));
      setUploadStatus("done");
    } catch (err) {
      setUploadStatus("error");
      toast_(err.message || "Upload failed.");
    }
  }

  async function castVote(topicId) {
    if (!voteForm.choice || !voteForm.voter) return;
    setSyncing(true);
    try {
      await api({ action: "castVote", topicId, voter: voteForm.voter, choice: voteForm.choice, note: voteForm.note });
      setVoteForm({ voter: "", choice: "", note: "" });
      setView("home");
      toast_("Vote recorded.");
      loadTopics();
    } catch (err) {
      toast_(err.message || "Failed to cast vote.");
    } finally {
      setSyncing(false);
    }
  }

  async function closeTopic(topicId) {
    setSyncing(true);
    try {
      await api({ action: "closeTopic", topicId });
      await loadTopics();
      toast_("Topic closed.");
    } catch (err) {
      toast_(err.message || "Failed to close topic.");
    } finally {
      setSyncing(false);
    }
  }

  const sel = topics.find(t => t.id === selId);
  const openTopics = topics.filter(t => !isClosed(t));
  const closedTopics = topics.filter(t => isClosed(t));

  // MEMBERS
  if (view === "members") return (
    <Page title="Board Members" onBack={() => setView("home")}>
      {members.map((m, i) => (
        <div key={m} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", border: "1px solid #ddd", borderRadius: 8, background: "#fff" }}>
          <span style={{ fontSize: 16, fontFamily: OPEN }}>{m}</span>
          <button onClick={() => setMembers(p => p.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#c0392b", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <input value={newMember} onChange={e => setNewMember(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && newMember.trim()) { setMembers(p => [...p, newMember.trim()]); setNewMember(""); } }}
          placeholder="Add member name..." style={iStyle} />
        <button onClick={() => { if (newMember.trim()) { setMembers(p => [...p, newMember.trim()]); setNewMember(""); } }} style={btnStyle}>Add</button>
      </div>
    </Page>
  );

  // NEW TOPIC
  if (view === "new") return (
    <Page title="New Voting Topic" onBack={() => setView("home")}>
      <label style={lStyle}>Title *</label>
      <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={iStyle} />
      <label style={lStyle}>Description (optional)</label>
      <div style={{ border: "2px solid #ccc", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 4, padding: "6px 8px", background: "#f5f5f5", borderBottom: "1px solid #ddd" }}>
          <button type="button" onMouseDown={e => { e.preventDefault(); applyFormat("bold"); }} style={{ fontWeight: "700", fontSize: 14, fontFamily: OPEN, background: "#fff", border: "1px solid #ccc", borderRadius: 4, padding: "2px 10px", cursor: "pointer" }}>B</button>
          <button type="button" onMouseDown={e => { e.preventDefault(); applyFormat("italic"); }} style={{ fontStyle: "italic", fontSize: 14, fontFamily: OPEN, background: "#fff", border: "1px solid #ccc", borderRadius: 4, padding: "2px 10px", cursor: "pointer" }}>I</button>
        </div>
        <div
          ref={descRef}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Additional context..."
          style={{ minHeight: 90, padding: "10px 14px", fontSize: 15, fontFamily: OPEN, outline: "none", lineHeight: 1.6, color: "#1a1a1a" }}
        />
      </div>
      <label style={lStyle}>Submitted by (optional)</label>
      <input value={form.submittedBy} onChange={e => setForm(p => ({ ...p, submittedBy: e.target.value }))}
        placeholder="Name" style={iStyle} />
      <label style={lStyle}>Due Date (optional)</label>
      <input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} style={iStyle} />
      <label style={lStyle}>Attachment (optional)</label>
      <label style={{ display: "flex", alignItems: "center", gap: 12, border: `2px dashed ${uploadStatus === "done" ? "#1a7a1a" : uploadStatus === "error" ? "#c0392b" : "#ccc"}`, borderRadius: 8, padding: "12px 16px", cursor: uploadStatus === "uploading" ? "default" : "pointer", background: "#fafafa" }}>
        <input type="file" onChange={handleFileUpload} style={{ display: "none" }} disabled={uploadStatus === "uploading"} />
        <span style={{ background: uploadStatus === "done" ? "#1a7a1a" : GOLD, color: "#fff", borderRadius: 6, padding: "6px 14px", fontSize: 14, fontWeight: "600", fontFamily: OPEN, whiteSpace: "nowrap" }}>
          {uploadStatus === "uploading" ? "Uploading…" : uploadStatus === "done" ? "✓ Uploaded" : "Upload to Drive"}
        </span>
        <span style={{ fontSize: 14, fontFamily: OPEN, color: form.fileName ? "#1a1a1a" : "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {uploadStatus === "uploading" ? "Saving to Board Voting folder…" : form.fileName || "No file chosen"}
        </span>
        {uploadStatus === "done" && <button type="button" onClick={e => { e.preventDefault(); setForm(p => ({ ...p, fileUrl: "", fileName: "" })); setUploadStatus("idle"); }} style={{ marginLeft: "auto", background: "none", border: "none", color: "#c0392b", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>}
      </label>
      <button onClick={submitTopic} disabled={syncing} style={{ ...btnStyle, width: "100%", padding: "14px", marginTop: 4, opacity: syncing ? 0.6 : 1 }}>
        {syncing ? "Saving…" : "Submit Topic"}
      </button>
    </Page>
  );

  // TOPIC DETAIL
  if (view === "topic" && sel) {
    const closed = isClosed(sel);
    const voteCount = Object.keys(sel.votes || {}).length;
    const tally = { Yes: 0, No: 0, Abstain: 0 };
    Object.values(sel.votes || {}).forEach(v => { if (tally[v.choice] !== undefined) tally[v.choice]++; });
    const voterAlreadyVoted = voteForm.voter && sel.votes?.[voteForm.voter];

    return (
      <Page title="" onBack={() => { setVoteForm({ voter: "", choice: "", note: "" }); setView("home"); }}>
        {/* Topic Info Box */}
        <div style={{ borderLeft: `4px solid ${GOLD}`, borderRadius: 4, background: "#fff", padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 10, fontWeight: "700", fontFamily: OPEN, textTransform: "uppercase", letterSpacing: 2, color: GOLD }}>Motion</div>
          <div style={{ fontSize: 19, fontWeight: "800", fontFamily: OPEN, color: "#1a1a1a", lineHeight: 1.3 }}>{sel.title}</div>

          {sel.description && (
            <p style={{ fontSize: 15, fontFamily: OPEN, color: "#444", lineHeight: 1.7, margin: 0, borderTop: "1px solid #eee", paddingTop: 14 }}>{renderText(sel.description)}</p>
          )}

          {sel.fileUrl && (
            <div style={{ borderTop: "1px solid #eee", paddingTop: 14 }}>
              <a href={sel.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: "600", fontFamily: OPEN, color: GOLD, textDecoration: "none" }}>
                📄 {sel.fileName || "View attachment"}
              </a>
            </div>
          )}
          {sel.submittedBy && (
            <div style={{ alignSelf: "flex-end", fontSize: 12, fontFamily: OPEN, color: "#666" }}>
              Submitted by: <strong style={{ color: "#444" }}>{sel.submittedBy}</strong>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <Badge color={closed ? "#555" : "#1a7a1a"}>{closed ? "CLOSED" : "OPEN"}</Badge>
          <Badge color={GOLD}>{voteCount} / {sel.totalMembers} voted</Badge>
          <Badge color={GOLD}>Due: {fmtDate(sel.dueDate)}</Badge>
        </div>

        {/* Results */}
        <div style={{ border: "2px solid #ddd", borderRadius: 10, padding: 20, background: "#fff" }}>
          {closed ? (
            <>
              <div style={{ fontWeight: "700", fontSize: 17, fontFamily: SERIF, marginBottom: 14, color: "#1a1a1a" }}>Final Results</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
                {["Yes", "No", "Abstain"].map(c => (
                  <div key={c} style={{ textAlign: "center", padding: "12px 8px", background: "#fff", borderRadius: 8, border: "1px solid #eee" }}>
                    <div style={{ fontSize: 30, fontWeight: "700", fontFamily: SERIF, color: CHOICE_COLOR[c] }}>{tally[c]}</div>
                    <div style={{ fontSize: 13, fontFamily: OPEN, color: "#555", marginTop: 2 }}>{c}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontWeight: "700", fontSize: 15, fontFamily: SERIF, marginBottom: 10, color: "#1a1a1a" }}>Individual Votes</div>
              {members.map(m => {
                const v = sel.votes?.[m];
                return (
                  <div key={m} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderTop: "1px solid #eee" }}>
                    <div>
                      <div style={{ fontWeight: "600", fontSize: 15, fontFamily: OPEN }}>{m}</div>
                      {v?.note && <div style={{ color: "#555", fontSize: 13, fontFamily: OPEN, marginTop: 2 }}>"{v.note}"</div>}
                    </div>
                    <span style={{ fontWeight: "700", fontFamily: OPEN, color: v ? CHOICE_COLOR[v.choice] : "#aaa", fontSize: 15, marginLeft: 16, whiteSpace: "nowrap" }}>
                      {v ? v.choice : "—"}
                    </span>
                  </div>
                );
              })}
            </>
          ) : (
            <div style={{ fontSize: 15, fontFamily: OPEN, color: "#333" }}>
              <strong>{voteCount}</strong> of <strong>{sel.totalMembers}</strong> have voted. Results are hidden until voting closes.
            </div>
          )}
        </div>

        {/* Vote form */}
        {!closed && (
          <div style={{ border: `2px solid ${GOLD}`, borderRadius: 10, padding: 20, background: "#fff" }}>
            <div style={{ fontWeight: "700", fontSize: 17, fontFamily: SERIF, marginBottom: 16, color: "#1a1a1a" }}>Cast a Vote</div>
            <label style={{ ...lStyle, display: "block", marginBottom: 14 }}>Who is voting?</label>
            <select value={voteForm.voter} onChange={e => setVoteForm(p => ({ ...p, voter: e.target.value, choice: "", note: "" }))} style={{ ...iStyle, marginBottom: 14, color: voteForm.voter ? "#1a1a1a" : "#999" }}>
              <option value="">— Select your name —</option>
              {members.map(m => {
                const voted = !!sel.votes?.[m];
                return (
                  <option key={m} value={m} disabled={voted} style={{ color: voted ? "#bbb" : "#222" }}>
                    {m}{voted ? " (voted)" : ""}
                  </option>
                );
              })}
            </select>

            {voteForm.voter && !voterAlreadyVoted && (
              <>
                <label style={lStyle}>Your vote</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {["Yes", "No", "Abstain"].map(c => (
                    <button key={c} onClick={() => setVoteForm(p => ({ ...p, choice: c }))} style={{
                      flex: 1, padding: "12px 0", fontSize: 15, fontWeight: "600", fontFamily: OPEN,
                      border: `2px solid ${voteForm.choice === c ? CHOICE_COLOR[c] : "#ccc"}`,
                      borderRadius: 8, background: voteForm.choice === c ? CHOICE_COLOR[c] : "#fff",
                      color: voteForm.choice === c ? "#fff" : "#333", cursor: "pointer"
                    }}>{c}</button>
                  ))}
                </div>
                <label style={lStyle}>Note (optional)</label>
                <textarea value={voteForm.note} onChange={e => setVoteForm(p => ({ ...p, note: e.target.value }))}
                  placeholder="Add context to your vote..." rows={2} style={{ ...iStyle, marginBottom: 12 }} />
                <button onClick={() => castVote(sel.id)} disabled={!voteForm.choice || syncing} style={{
                  ...btnStyle, width: "100%", padding: "14px",
                  opacity: (voteForm.choice && !syncing) ? 1 : 0.4,
                  cursor: (voteForm.choice && !syncing) ? "pointer" : "default"
                }}>{syncing ? "Saving…" : "Submit Vote"}</button>
              </>
            )}

            {voterAlreadyVoted && (
              <div style={{ background: "#f0f0f0", borderRadius: 8, padding: "12px 16px", fontSize: 15, fontFamily: OPEN, color: "#555" }}>
                ✓ <strong>{voteForm.voter}</strong> has already voted <strong style={{ color: CHOICE_COLOR[sel.votes[voteForm.voter].choice] }}>{sel.votes[voteForm.voter].choice}</strong> on this topic.
              </div>
            )}
          </div>
        )}

      </Page>
    );
  }

  // HOME
  return (
    <div style={{ fontFamily: OPEN, minHeight: "100vh", background: CREAM }}>
      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#222", color: "#fff", padding: "10px 24px", borderRadius: 8, fontSize: 14, fontFamily: OPEN, zIndex: 999 }}>
          {toast}
        </div>
      )}

      <div style={{ background: GOLD, padding: "20px 24px 22px", textAlign: "center" }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: 6, display: "block", margin: "0 auto 6px" }}>
          <rect x="6" y="12.8" width="28" height="22" rx="3.6" stroke="white" strokeWidth="2.2" />
          <rect x="6" y="12.8" width="28" height="7.3" rx="3.2" stroke="white" strokeWidth="2.2" />
          <path d="M14.2 16.4h11.6" stroke="white" strokeWidth="2.1" strokeLinecap="round" />
          <rect x="14.4" y="4.9" width="11.2" height="10.4" rx="1.3" fill={GOLD} stroke="white" strokeWidth="2.1" />
          <path d="m17.4 10.3 2 2.2 4.1-4.8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <text x="20" y="31.1" textAnchor="middle" fill="white" fontSize="7.2" fontWeight="700" letterSpacing="0.8">VOTE</text>
        </svg>
        <div style={{ fontSize: 10, fontFamily: SERIF, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 3, marginBottom: 4 }}>North Star House</div>
        <h1 style={{ fontSize: 26, margin: 0, fontWeight: "500", fontFamily: SERIF, color: "#fff", letterSpacing: 0.3 }}>Board Voting</h1>
      </div>

      <div style={{ maxWidth: APP_MAX_WIDTH, margin: "0 auto", padding: "24px 16px 40px" }}>
      <div style={{ marginBottom: 28 }}>
        <button onClick={() => setView("new")} style={{ ...btnStyle, width: "100%", padding: "12px" }}>Add Item for Board Vote</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", fontFamily: OPEN, color: "#888", padding: "60px 0", fontSize: 15 }}>Loading…</div>
      ) : (
        <>
          {openTopics.length > 0 && (
            <>
              <div style={secLabel}>Open Votes ({openTopics.length})</div>
              {openTopics.map(t => <TopicRow key={t.id} t={t} onClick={() => { setSelId(t.id); setVoteForm({ voter: "", choice: "", note: "" }); setView("topic"); }} />)}
            </>
          )}
          {closedTopics.length > 0 && (
            <>
              <div style={{ ...secLabel, marginTop: 24 }}>Closed ({closedTopics.length})</div>
              {closedTopics.map(t => <TopicRow key={t.id} t={t} onClick={() => { setSelId(t.id); setView("topic"); }} />)}
            </>
          )}
          {topics.length === 0 && (
            <div style={{ textAlign: "center", fontFamily: OPEN, color: "#888", padding: "60px 0", fontSize: 15 }}>No topics yet. Add the first one above.</div>
          )}
        </>
      )}
      </div>
    </div>
  );
}

function TopicRow({ t, onClick }) {
  const closed = isClosed(t);
  const voteCount = Object.keys(t.votes || {}).length;
  return (
    <div onClick={onClick} style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "14px 16px", marginBottom: 8, border: "2px solid #ddd", borderRadius: 10,
      background: "#fff", cursor: "pointer"
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = GOLD}
      onMouseLeave={e => e.currentTarget.style.borderColor = "#ddd"}
    >
      <div>
        <div style={{ fontSize: 16, fontWeight: "800", fontFamily: OPEN, color: "#1a1a1a" }}>{t.title}</div>
        <div style={{ fontSize: 13, fontFamily: OPEN, color: "#666", marginTop: 3 }}>{voteCount} / {t.totalMembers} voted · {fmtDate(t.dueDate)}</div>
      </div>
      <span style={{
        fontSize: 13, fontFamily: OPEN, fontWeight: "600", padding: "4px 12px", borderRadius: 20, whiteSpace: "nowrap", marginLeft: 12,
        background: closed ? "#eee" : "#fff3cd",
        color: closed ? "#555" : "#856404",
        border: `1px solid ${closed ? "#ccc" : "#856404"}`,
      }}>
        {closed ? "Closed" : "Open"}
      </span>
    </div>
  );
}

function Page({ title, onBack, children }) {
  return (
    <div style={{ fontFamily: OPEN, minHeight: "100vh", background: CREAM }}>
      <div style={{ background: GOLD, padding: "16px 20px", textAlign: "center", position: "relative" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", padding: 0, lineHeight: 1, opacity: 0.85, position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)" }}>←</button>
        <div style={{ fontSize: 10, fontFamily: SERIF, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 3, marginBottom: 2 }}>North Star House</div>
        <h2 style={{ fontSize: 22, margin: 0, fontWeight: "500", fontFamily: SERIF, color: "#fff", letterSpacing: 0.3 }}>{title || "Board Voting"}</h2>
      </div>
      <div style={{ maxWidth: APP_MAX_WIDTH, margin: "0 auto", padding: "20px 16px 40px", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </div>
  );
}

function Badge({ color, children }) {
  return <span style={{ fontSize: 12, fontFamily: OPEN, fontWeight: "600", padding: "4px 10px", borderRadius: 20, background: color, color: "#fff" }}>{children}</span>;
}

const btnStyle = { background: GOLD, color: "#fff", border: "none", borderRadius: 8, padding: "12px 18px", fontSize: 15, cursor: "pointer", fontFamily: OPEN, fontWeight: "600" };
const outlineBtn = { background: "#fff", border: `2px solid ${GOLD}`, borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer", fontFamily: OPEN, color: GOLD, fontWeight: "600" };
const iStyle = { width: "100%", border: "2px solid #ccc", borderRadius: 8, padding: "10px 14px", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: OPEN };
const lStyle = { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 2, fontFamily: OPEN };
const secLabel = { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.5, color: GOLD, marginBottom: 10, fontFamily: OPEN };

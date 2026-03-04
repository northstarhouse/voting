import { useState, useEffect } from "react";

const cardoLink = document.createElement("link");
cardoLink.rel = "stylesheet";
cardoLink.href = "https://fonts.googleapis.com/css2?family=Cardo:ital,wght@0,400;0,700;1,400&family=Open+Sans:wght@400;600;700;800&display=swap";
document.head.appendChild(cardoLink);

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwrsP-Nnq_hp5QWWks6BA5ZnuS2B9E_KQyFskRQC0PSehb6NcspJhyO4wlqD3-VfsEwxg/exec";
const INITIAL_MEMBERS = ["Ken", "Wyn", "Paula", "Rick", "Jeff", "Rich"];
const GOLD = "#886c44";
const OPEN = "'Open Sans', sans-serif";
const CARDO = "'Cardo', serif";

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
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
  const [form, setForm] = useState({ title: "", description: "", dueDate: "", fileUrl: "", fileName: "" });
  const [voteForm, setVoteForm] = useState({ voter: "", choice: "", note: "" });
  const [newMember, setNewMember] = useState("");
  const [toast, setToast] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("idle");

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
      await api({
        action: "addTopic",
        title: form.title.trim(),
        description: form.description.trim(),
        dueDate: form.dueDate,
        totalMembers: members.length,
        fileUrl: form.fileUrl || "",
        fileName: form.fileName || "",
      });
      setForm({ title: "", description: "", dueDate: "", fileUrl: "", fileName: "" });
      setUploadStatus("idle");
      await loadTopics();
      setView("home");
      toast_("Topic added.");
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
      await loadTopics();
      setView("home");
      toast_("Vote recorded.");
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
      <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Approve Q3 Budget" style={iStyle} />
      <label style={lStyle}>Description (optional)</label>
      <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
        placeholder="Additional context..." rows={4} style={{ ...iStyle, resize: "vertical" }} />
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
        <div style={{ borderRadius: 12, overflow: "hidden", border: "2px solid #d4b483", boxShadow: "0 2px 8px rgba(136,108,68,0.10)" }}>
          <div style={{ background: GOLD, padding: "10px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: "700", fontFamily: OPEN, textTransform: "uppercase", letterSpacing: 2, color: "rgba(255,255,255,0.85)" }}>Motion to Vote On</div>
          </div>
          <div style={{ background: "#fff", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: "700", fontFamily: OPEN, textTransform: "uppercase", letterSpacing: 1.5, color: GOLD, marginBottom: 4 }}>Topic</div>
              <div style={{ fontSize: 19, fontWeight: "700", fontFamily: CARDO, color: "#1a1a1a", lineHeight: 1.3 }}>{sel.title}</div>
            </div>

            {sel.description && (
              <div>
                <div style={{ fontSize: 11, fontWeight: "700", fontFamily: OPEN, textTransform: "uppercase", letterSpacing: 1.5, color: GOLD, marginBottom: 4 }}>Description</div>
                <p style={{ fontSize: 15, fontFamily: OPEN, color: "#333", lineHeight: 1.6, margin: 0 }}>{sel.description}</p>
              </div>
            )}

            <div>
              <div style={{ fontSize: 11, fontWeight: "700", fontFamily: OPEN, textTransform: "uppercase", letterSpacing: 1.5, color: GOLD, marginBottom: 6 }}>Attached Documents</div>
              {sel.fileUrl ? (
                <a href={sel.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: "600", fontFamily: OPEN, color: GOLD, textDecoration: "none", border: `1px solid ${GOLD}`, borderRadius: 6, padding: "6px 14px", background: "#fff" }}>
                  ↗ {sel.fileName || "View attachment"}
                </a>
              ) : (
                <div style={{ fontSize: 14, fontFamily: OPEN, color: "#aaa" }}>None</div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <Badge color={closed ? "#555" : "#1a7a1a"}>{closed ? "CLOSED" : "OPEN"}</Badge>
          <Badge color="#333">{voteCount} / {sel.totalMembers} voted</Badge>
          <Badge color="#333">Due: {fmtDate(sel.dueDate)}</Badge>
        </div>

        {/* Results */}
        <div style={{ border: "2px solid #ddd", borderRadius: 10, padding: 20 }}>
          {closed ? (
            <>
              <div style={{ fontWeight: "700", fontSize: 17, fontFamily: CARDO, marginBottom: 14, color: "#1a1a1a" }}>Final Results</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
                {["Yes", "No", "Abstain"].map(c => (
                  <div key={c} style={{ textAlign: "center", padding: "12px 8px", background: "#f5f5f5", borderRadius: 8 }}>
                    <div style={{ fontSize: 30, fontWeight: "700", fontFamily: CARDO, color: CHOICE_COLOR[c] }}>{tally[c]}</div>
                    <div style={{ fontSize: 13, fontFamily: OPEN, color: "#555", marginTop: 2 }}>{c}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontWeight: "700", fontSize: 15, fontFamily: CARDO, marginBottom: 10, color: "#1a1a1a" }}>Individual Votes</div>
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
          <div style={{ border: `2px solid ${GOLD}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontWeight: "700", fontSize: 17, fontFamily: CARDO, marginBottom: 16, color: "#1a1a1a" }}>Cast a Vote</div>
            <label style={lStyle}>Who is voting?</label>
            <select value={voteForm.voter} onChange={e => setVoteForm(p => ({ ...p, voter: e.target.value, choice: "", note: "" }))} style={{ ...iStyle, marginBottom: 14, color: voteForm.voter ? "#1a1a1a" : "#999" }}>
              <option value="">— Select your name —</option>
              {members.map(m => (
                <option key={m} value={m} disabled={!!sel.votes?.[m]}>
                  {m}{sel.votes?.[m] ? " (already voted)" : ""}
                </option>
              ))}
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

        {!closed && (
          <button onClick={() => closeTopic(sel.id)} disabled={syncing} style={{ ...outlineBtn, width: "100%", padding: "11px", opacity: syncing ? 0.5 : 1 }}>
            Close Voting Early
          </button>
        )}
      </Page>
    );
  }

  // HOME
  return (
    <div style={{ fontFamily: OPEN, maxWidth: 560, margin: "0 auto", padding: "0 16px 40px" }}>
      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#222", color: "#fff", padding: "10px 24px", borderRadius: 8, fontSize: 14, fontFamily: OPEN, zIndex: 999 }}>
          {toast}
        </div>
      )}

      <div style={{ padding: "24px 0 20px" }}>
        <div style={{ fontSize: 12, fontFamily: OPEN, color: GOLD, textTransform: "uppercase", letterSpacing: 2, fontWeight: "700" }}>North Star House</div>
        <h1 style={{ fontSize: 24, margin: "2px 0 0", fontWeight: "700", fontFamily: CARDO, color: "#1a1a1a" }}>Board Voting</h1>
      </div>

      <div style={{ marginBottom: 28 }}>
        <button onClick={() => setView("new")} style={{ ...btnStyle, width: "100%", padding: "12px" }}>+ New Topic</button>
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
        <div style={{ fontSize: 16, fontWeight: "700", fontFamily: CARDO, color: "#1a1a1a" }}>{t.title}</div>
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
    <div style={{ fontFamily: OPEN, maxWidth: 560, margin: "0 auto", padding: "0 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "24px 0 20px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>←</button>
        <h2 style={{ fontSize: 22, margin: 0, fontWeight: "700", fontFamily: CARDO, color: "#1a1a1a" }}>{title}</h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
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

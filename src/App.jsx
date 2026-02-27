import { useState, useEffect } from "react";

const cardoLink = document.createElement("link");
cardoLink.rel = "stylesheet";
cardoLink.href = "https://fonts.googleapis.com/css2?family=Cardo:ital,wght@0,400;0,700;1,400&display=swap";
document.head.appendChild(cardoLink);

const INITIAL_MEMBERS = ["Haley", "Member 2", "Member 3", "Member 4", "Member 5", "Member 6"];
const GOLD = "#886c44";

function useLS(key, def) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}

function isClosed(t, memberCount) {
  if (t.closed) return true;
  if (t.dueDate && new Date() > new Date(t.dueDate)) return true;
  if (Object.keys(t.votes || {}).length >= memberCount) return true;
  return false;
}

function fmtDate(iso) {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const CHOICE_COLOR = { Yes: "#1a7a1a", No: "#c0392b", Abstain: "#666" };

export default function App() {
  const [members, setMembers] = useLS("nsb3_members", INITIAL_MEMBERS);
  const [topics, setTopics] = useLS("nsb3_topics", []);
  const [view, setView] = useState("home"); // home | topic | new | members
  const [selId, setSelId] = useState(null);
  const [form, setForm] = useState({ title: "", description: "", dueDate: "", file: null, fileName: "" });
  const [voteForm, setVoteForm] = useState({ voter: "", choice: "", note: "" });
  const [newMember, setNewMember] = useState("");
  const [toast, setToast] = useState(null);

  function toast_(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  function submitTopic() {
    if (!form.title.trim()) return;
    setTopics(p => [{
      id: Date.now().toString(), title: form.title.trim(), description: form.description.trim(),
      dueDate: form.dueDate, votes: {}, closed: false,
      totalMembers: members.length, createdAt: new Date().toISOString(),
      file: form.file || null, fileName: form.fileName || null
    }, ...p]);
    setForm({ title: "", description: "", dueDate: "", file: null, fileName: "" });
    setView("home"); toast_("Topic added.");
  }

  function handleFileChange(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast_("File too large (max 4 MB)"); return; }
    const reader = new FileReader();
    reader.onload = ev => setForm(p => ({ ...p, file: ev.target.result, fileName: f.name }));
    reader.readAsDataURL(f);
  }

  function castVote(topicId) {
    if (!voteForm.choice || !voteForm.voter) return;
    setTopics(p => p.map(t => t.id !== topicId ? t : {
      ...t, votes: { ...t.votes, [voteForm.voter]: { choice: voteForm.choice, note: voteForm.note, time: new Date().toISOString() } }
    }));
    setVoteForm({ voter: "", choice: "", note: "" });
    setView("home"); toast_("Vote recorded.");
  }

  const sel = topics.find(t => t.id === selId);
  const openTopics = topics.filter(t => !isClosed(t, members.length));
  const closedTopics = topics.filter(t => isClosed(t, members.length));

  // MEMBERS
  if (view === "members") return (
    <Page title="Board Members" onBack={() => setView("home")}>
      {members.map((m, i) => (
        <div key={m} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", border: "1px solid #ddd", borderRadius: 8, background: "#fff" }}>
          <span style={{ fontSize: 16 }}>{m}</span>
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
      <label style={lStyle}>Attachment (optional, max 4 MB)</label>
      <label style={{ display: "flex", alignItems: "center", gap: 12, border: "2px dashed #ccc", borderRadius: 8, padding: "12px 16px", cursor: "pointer", background: "#fafafa" }}>
        <input type="file" onChange={handleFileChange} style={{ display: "none" }} />
        <span style={{ background: GOLD, color: "#fff", borderRadius: 6, padding: "6px 14px", fontSize: 14, fontWeight: "bold", whiteSpace: "nowrap" }}>Choose file</span>
        <span style={{ fontSize: 14, color: form.fileName ? "#1a1a1a" : "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {form.fileName || "No file chosen"}
        </span>
        {form.fileName && <button type="button" onClick={e => { e.preventDefault(); setForm(p => ({ ...p, file: null, fileName: "" })); }} style={{ marginLeft: "auto", background: "none", border: "none", color: "#c0392b", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>}
      </label>
      <button onClick={submitTopic} style={{ ...btnStyle, width: "100%", padding: "14px", marginTop: 4 }}>Submit Topic</button>
    </Page>
  );

  // TOPIC DETAIL
  if (view === "topic" && sel) {
    const closed = isClosed(sel, members.length);
    const voteCount = Object.keys(sel.votes || {}).length;
    const tally = { Yes: 0, No: 0, Abstain: 0 };
    Object.values(sel.votes || {}).forEach(v => { if (tally[v.choice] !== undefined) tally[v.choice]++; });

    const voterAlreadyVoted = voteForm.voter && sel.votes?.[voteForm.voter];

    return (
      <Page title={sel.title} onBack={() => { setVoteForm({ voter: "", choice: "", note: "" }); setView("home"); }}>
        {sel.description && <p style={{ fontSize: 15, color: "#333", lineHeight: 1.6, margin: "0 0 4px" }}>{sel.description}</p>}
        {sel.file && (
          <a href={sel.file} download={sel.fileName} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: "bold", color: GOLD, textDecoration: "none", border: `1px solid ${GOLD}`, borderRadius: 6, padding: "6px 14px", background: "#fff" }}>
            ↓ {sel.fileName}
          </a>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <Badge color={closed ? "#555" : "#1a7a1a"}>{closed ? "CLOSED" : "OPEN"}</Badge>
          <Badge color="#333">{voteCount} / {sel.totalMembers} voted</Badge>
          <Badge color="#333">Due: {fmtDate(sel.dueDate)}</Badge>
        </div>

        {/* Results */}
        <div style={{ border: "2px solid #ddd", borderRadius: 10, padding: 20 }}>
          {closed ? (
            <>
              <div style={{ fontWeight: "800", fontSize: 17, marginBottom: 14, color: "#1a1a1a" }}>Final Results</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
                {["Yes", "No", "Abstain"].map(c => (
                  <div key={c} style={{ textAlign: "center", padding: "12px 8px", background: "#f5f5f5", borderRadius: 8 }}>
                    <div style={{ fontSize: 30, fontWeight: "800", color: CHOICE_COLOR[c] }}>{tally[c]}</div>
                    <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>{c}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontWeight: "800", fontSize: 15, marginBottom: 10, color: "#1a1a1a" }}>Individual Votes</div>
              {members.map(m => {
                const v = sel.votes?.[m];
                return (
                  <div key={m} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderTop: "1px solid #eee" }}>
                    <div>
                      <div style={{ fontWeight: "700", fontSize: 15 }}>{m}</div>
                      {v?.note && <div style={{ color: "#555", fontSize: 13, marginTop: 2 }}>"{v.note}"</div>}
                    </div>
                    <span style={{ fontWeight: "700", color: v ? CHOICE_COLOR[v.choice] : "#aaa", fontSize: 15, marginLeft: 16, whiteSpace: "nowrap" }}>
                      {v ? v.choice : "—"}
                    </span>
                  </div>
                );
              })}
            </>
          ) : (
            <div style={{ fontSize: 16, color: "#333" }}>
              <strong>{voteCount}</strong> of <strong>{sel.totalMembers}</strong> have voted. Results are hidden until voting closes.
            </div>
          )}
        </div>

        {/* Vote form */}
        {!closed && (
          <div style={{ border: `2px solid ${GOLD}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontWeight: "800", fontSize: 17, marginBottom: 16, color: "#1a1a1a" }}>Cast a Vote</div>

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
                      flex: 1, padding: "12px 0", fontSize: 16, fontWeight: "bold",
                      border: `2px solid ${voteForm.choice === c ? CHOICE_COLOR[c] : "#ccc"}`,
                      borderRadius: 8, background: voteForm.choice === c ? CHOICE_COLOR[c] : "#fff",
                      color: voteForm.choice === c ? "#fff" : "#333", cursor: "pointer"
                    }}>{c}</button>
                  ))}
                </div>
                <label style={lStyle}>Note (optional)</label>
                <textarea value={voteForm.note} onChange={e => setVoteForm(p => ({ ...p, note: e.target.value }))}
                  placeholder="Add context to your vote..." rows={2} style={{ ...iStyle, marginBottom: 12 }} />
                <button onClick={() => castVote(sel.id)} disabled={!voteForm.choice} style={{
                  ...btnStyle, width: "100%", padding: "14px", opacity: voteForm.choice ? 1 : 0.4, cursor: voteForm.choice ? "pointer" : "default"
                }}>Submit Vote</button>
              </>
            )}

            {voterAlreadyVoted && (
              <div style={{ background: "#f0f0f0", borderRadius: 8, padding: "12px 16px", fontSize: 15, color: "#555" }}>
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
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 560, margin: "0 auto", padding: "0 16px 40px" }}>
      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#222", color: "#fff", padding: "10px 24px", borderRadius: 8, fontSize: 14, zIndex: 999, fontFamily: "system-ui, sans-serif" }}>
          {toast}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 0 20px" }}>
        <div>
          <div style={{ fontSize: 12, color: GOLD, textTransform: "uppercase", letterSpacing: 2, fontWeight: "bold" }}>North Star House</div>
          <h1 style={{ fontSize: 24, margin: "2px 0 0", fontWeight: "800", color: "#1a1a1a", fontFamily: "'Cardo', serif" }}>Board Voting</h1>
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <button onClick={() => setView("new")} style={{ ...btnStyle, width: "100%", padding: "12px" }}>+ New Topic</button>
      </div>

      {openTopics.length > 0 && (
        <>
          <div style={secLabel}>Open Votes ({openTopics.length})</div>
          {openTopics.map(t => <TopicRow key={t.id} t={t} memberCount={members.length} onClick={() => { setSelId(t.id); setVoteForm({ voter: "", choice: "", note: "" }); setView("topic"); }} />)}
        </>
      )}

      {closedTopics.length > 0 && (
        <>
          <div style={{ ...secLabel, marginTop: 24 }}>Closed ({closedTopics.length})</div>
          {closedTopics.map(t => <TopicRow key={t.id} t={t} memberCount={members.length} onClick={() => { setSelId(t.id); setView("topic"); }} />)}
        </>
      )}

      {topics.length === 0 && (
        <div style={{ textAlign: "center", color: "#888", padding: "60px 0", fontSize: 15 }}>No topics yet. Add the first one above.</div>
      )}
    </div>
  );
}

function TopicRow({ t, memberCount, onClick }) {
  const closed = isClosed(t, memberCount);
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
        <div style={{ fontSize: 16, fontWeight: "800", color: "#1a1a1a" }}>{t.title}</div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 3 }}>{voteCount} / {memberCount} voted · {fmtDate(t.dueDate)}</div>
      </div>
      <span style={{
        fontSize: 13, fontWeight: "bold", padding: "4px 12px", borderRadius: 20, whiteSpace: "nowrap", marginLeft: 12,
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
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 560, margin: "0 auto", padding: "0 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "24px 0 20px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>←</button>
        <h2 style={{ fontSize: 22, margin: 0, fontWeight: "800", color: "#1a1a1a" }}>{title}</h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </div>
  );
}

function Badge({ color, children }) {
  return <span style={{ fontSize: 12, fontWeight: "bold", padding: "4px 10px", borderRadius: 20, background: color, color: "#fff" }}>{children}</span>;
}

const btnStyle = { background: GOLD, color: "#fff", border: "none", borderRadius: 8, padding: "12px 18px", fontSize: 15, cursor: "pointer", fontFamily: "system-ui, sans-serif", fontWeight: "bold" };
const iStyle = { width: "100%", border: "2px solid #ccc", borderRadius: 8, padding: "10px 14px", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "'Cardo', serif" };
const lStyle = { fontSize: 14, fontWeight: "bold", color: "#333", marginBottom: 2, fontFamily: "'Cardo', serif" };
const secLabel = { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.5, color: GOLD, marginBottom: 10, fontFamily: "system-ui, sans-serif" };

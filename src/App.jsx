import { useState, useEffect, useRef } from "react";
import "./App.css";
import { requireSupabase, SUPABASE_STORAGE_BUCKET } from "./supabase";

const cardoLink = document.createElement("link");
cardoLink.rel = "stylesheet";
cardoLink.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Cardo:ital,wght@0,400;0,700;1,400&display=swap";
document.head.appendChild(cardoLink);

const INITIAL_MEMBERS = ["Ken", "Wyn", "Paula", "Rick", "Jeff", "Rich"];
const BOARD_MEMBER_COUNT = 6;
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
  if (Object.keys(t.votes || {}).length >= BOARD_MEMBER_COUNT) return true;
  return false;
}

function isPastDue(t) {
  return !!(t.dueDate && new Date() > new Date(t.dueDate));
}

// Voting is locked only when manually closed or all members have voted - NOT just because date passed
function isVotingLocked(t) {
  if (t.closed) return true;
  if (Object.keys(t.votes || {}).length >= BOARD_MEMBER_COUNT) return true;
  return false;
}

function fmtDate(iso) {
  if (!iso) return "No due date";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "No due date";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const CHOICE_COLOR = { Yes: "#1a7a1a", No: "#c0392b", Abstain: "#666", "Not in attendance": "#8e6c3a" };
const STANDARD_VOTE_CHOICES = ["Yes", "No", "Abstain"];
const POST_MEETING_VOTE_CHOICES = ["Yes", "No", "Abstain", "Not in attendance"];

function renderText(text) {
  if (!text) return null;
  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
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

// Convert arbitrary HTML to simple safe HTML (only strong/em/br)
function cleanHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  function walk(node) {
    if (node.nodeType === 3) return node.textContent.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const tag = (node.tagName || '').toLowerCase();
    if (['script','style','head'].includes(tag)) return '';
    if (tag === 'br') return '<br>';
    const style = node.getAttribute?.('style') || '';
    const isBold = ['b','strong','h1','h2','h3','h4','h5','h6'].includes(tag) ||
      /font-weight\s*:\s*(bold|[6-9]\d\d|[1-9]\d{3,})/i.test(style);
    const isItalic = ['i','em'].includes(tag) || /font-style\s*:\s*italic/i.test(style);
    const isBlock = ['p','div','h1','h2','h3','h4','h5','h6','li','tr','td'].includes(tag);
    let out = Array.from(node.childNodes).map(walk).join('');
    if (isItalic) out = `<em>${out}</em>`;
    if (isBold) out = `<strong>${out}</strong>`;
    if (isBlock) out = out + '<br>';
    return out;
  }
  return Array.from(tmp.childNodes).map(walk).join('')
    .replace(/(<br>){3,}/g, '<br><br>')
    .replace(/^(<br>)+|(<br>)+$/g, '');
}

function mapTopicRow(topic, votes) {
  return {
    id: topic.id,
    title: topic.title || "",
    description: topic.description || "",
    dueDate: topic.dueDate || "",
    closed: topic.closed === true || String(topic.closed).toLowerCase() === "true",
    submittedBy: topic.submittedBy || "",
    totalMembers: Number(topic.totalMembers || 0),
    fileUrl: topic.fileUrl || "",
    fileName: topic.fileName || "",
    overallConsensus: topic.overallConsensus || "",
    stipulations: topic.stipulations || "",
    nextSteps: topic.nextSteps || "",
    votes,
  };
}

function toVoteMap(voteRows) {
  return voteRows.reduce((acc, vote) => {
    if (!acc[vote.topicId]) acc[vote.topicId] = {};
    acc[vote.topicId][vote.voter] = {
      choice: vote.choice || "",
      note: vote.note || "",
      at: vote.timestamp || "",
    };
    return acc;
  }, {});
}

export default function App() {
  const [members, setMembers] = useState(INITIAL_MEMBERS);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState("home");
  const [selId, setSelId] = useState(null);
  const [form, setForm] = useState({ title: "", description: "", submittedBy: "", dueDate: "", fileUrl: "", fileName: "" });
  const [editForm, setEditForm] = useState({ title: "", description: "", submittedBy: "", dueDate: "", fileUrl: "", fileName: "" });
  const [postMeetingForm, setPostMeetingForm] = useState({ overallConsensus: "", stipulations: "", nextSteps: "" });
  const [postMeetingOpen, setPostMeetingOpen] = useState(false);
  const [voteForm, setVoteForm] = useState({ voter: "", choice: "", note: "" });
  const [newMember, setNewMember] = useState("");
  const [toast, setToast] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [editUploadStatus, setEditUploadStatus] = useState("idle");
  const descRef = useRef(null);
  const editDescRef = useRef(null);
  const sel = topics.find(t => t.id === selId);

  function handlePaste(e) {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const content = html ? cleanHtml(html)
      : text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    const sel = window.getSelection();
    if (sel.rangeCount) {
      sel.deleteFromDocument();
      const range = sel.getRangeAt(0);
      const frag = range.createContextualFragment(content);
      range.insertNode(frag);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function applyFormat(cmd, ref) {
    (ref || descRef).current.focus();
    document.execCommand(cmd, false, null);
  }

  useEffect(() => {
    if (view === "edit" && editDescRef.current) {
      editDescRef.current.innerHTML = editForm.description || "";
    }
  }, [view]);

  useEffect(() => {
    if (view === "topic" && sel) {
      setPostMeetingForm({
        overallConsensus: sel.overallConsensus || "",
        stipulations: sel.stipulations || "",
        nextSteps: sel.nextSteps || "",
      });
      setPostMeetingOpen(false);
    }
  }, [view, selId]);

  function toast_(msg) { setToast(msg); setTimeout(() => setToast(null), 6000); }

  async function loadTopics() {
    try {
      const supabase = requireSupabase();
      const [{ data: topicRows, error: topicsError }, { data: voteRows, error: votesError }] = await Promise.all([
        supabase
          .from("Board Voting Items")
          .select("id, title, description, dueDate, closed, submittedBy, totalMembers, fileUrl, fileName, overallConsensus, stipulations, nextSteps, row_id")
          .order("row_id", { ascending: false }),
        supabase
          .from("Board-Votes")
          .select("topicId, voter, choice, note, timestamp"),
      ]);

      if (topicsError) throw topicsError;
      if (votesError) throw votesError;

      const votesByTopic = toVoteMap(voteRows || []);
      setTopics((topicRows || []).map((topic) => mapTopicRow(topic, votesByTopic[topic.id] || {})));
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
      const supabase = requireSupabase();
      const description = cleanHtml(descRef.current?.innerHTML || "");
      const topicId = crypto.randomUUID();
      const { error } = await supabase
        .from("Board Voting Items")
        .insert({
          id: topicId,
          title: form.title.trim(),
          description,
          submittedBy: form.submittedBy.trim(),
          dueDate: form.dueDate || "",
          totalMembers: String(BOARD_MEMBER_COUNT),
          fileUrl: form.fileUrl || "",
          fileName: form.fileName || "",
          closed: "false",
        });

      if (error) throw error;
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

  async function handleFileUpload(e, isEdit = false) {
    const file = e.target.files[0];
    if (!file) return;
    isEdit ? setEditUploadStatus("uploading") : setUploadStatus("uploading");
    try {
      const supabase = requireSupabase();
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const path = `${Date.now()}-${crypto.randomUUID()}${ext}`;
      const { error: uploadError } = await supabase
        .storage
        .from(SUPABASE_STORAGE_BUCKET)
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase
        .storage
        .from(SUPABASE_STORAGE_BUCKET)
        .getPublicUrl(path);

      if (isEdit) {
        setEditForm(p => ({ ...p, fileUrl: publicUrlData.publicUrl, fileName: file.name }));
        setEditUploadStatus("done");
      } else {
        setForm(p => ({ ...p, fileUrl: publicUrlData.publicUrl, fileName: file.name }));
        setUploadStatus("done");
      }
    } catch (err) {
      isEdit ? setEditUploadStatus("error") : setUploadStatus("error");
      toast_(err.message || "Upload failed.");
    }
  }

  async function updateTopic() {
    if (!editForm.title.trim()) return;
    setSyncing(true);
    try {
      const supabase = requireSupabase();
      const description = cleanHtml(editDescRef.current?.innerHTML || "");
      const { error } = await supabase
        .from("Board Voting Items")
        .update({
          title: editForm.title.trim(),
          description,
          submittedBy: editForm.submittedBy.trim(),
          dueDate: editForm.dueDate || "",
          fileUrl: editForm.fileUrl || "",
          fileName: editForm.fileName || "",
        })
        .eq("id", sel.id);

      if (error) throw error;
      setView("topic");
      toast_("Topic updated.");
      loadTopics();
    } catch (err) {
      toast_(err.message || "Failed to update topic.");
    } finally {
      setSyncing(false);
    }
  }

  async function castVote(topicId) {
    if (!voteForm.choice || !voteForm.voter) return;
    setSyncing(true);
    const topic = topics.find(t => t.id === topicId);
    const previousVote = topic?.votes?.[voteForm.voter];
    const noteWithTag = isPastDue(topic)
      ? [voteForm.note.trim(), previousVote ? `[Changed in meeting - was: ${previousVote.choice}]` : "[Changed in meeting]"].filter(Boolean).join(" - ")
      : voteForm.note;
    try {
      const supabase = requireSupabase();
      const totalMembers = Number(topic?.totalMembers || BOARD_MEMBER_COUNT);
      const timestamp = new Date().toISOString();
      const { data: existingVote, error: existingVoteError } = await supabase
        .from("Board-Votes")
        .select("id")
        .eq("topicId", topicId)
        .eq("voter", voteForm.voter)
        .maybeSingle();

      if (existingVoteError) throw existingVoteError;

      const votePayload = {
        topicId,
        voter: voteForm.voter,
        choice: voteForm.choice,
        note: noteWithTag || "",
        timestamp,
        changed_in_meeting: isPastDue(topic),
      };

      const { error: voteError } = existingVote
        ? await supabase
            .from("Board-Votes")
            .update(votePayload)
            .eq("id", existingVote.id)
        : await supabase
            .from("Board-Votes")
            .insert(votePayload);

      if (voteError) throw voteError;

      const { count, error: countError } = await supabase
        .from("Board-Votes")
        .select("*", { count: "exact", head: true })
        .eq("topicId", topicId);

      if (countError) throw countError;

      if ((count || 0) >= totalMembers) {
        const { error: closeError } = await supabase
          .from("Board Voting Items")
          .update({ closed: "true" })
          .eq("id", topicId);

        if (closeError) throw closeError;
      }

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
      const supabase = requireSupabase();
      const { error } = await supabase
        .from("Board Voting Items")
        .update({ closed: "true" })
        .eq("id", topicId);

      if (error) throw error;
      await loadTopics();
      toast_("Topic closed.");
    } catch (err) {
      toast_(err.message || "Failed to close topic.");
    } finally {
      setSyncing(false);
    }
  }

  async function savePostMeetingUpdate() {
    if (!sel) return;
    setSyncing(true);
    try {
      const supabase = requireSupabase();
      const { error } = await supabase
        .from("Board Voting Items")
        .update({
          overallConsensus: postMeetingForm.overallConsensus.trim(),
          stipulations: postMeetingForm.stipulations.trim(),
          nextSteps: postMeetingForm.nextSteps.trim(),
        })
        .eq("id", sel.id);

      if (error) throw error;
      toast_("Post-meeting update saved.");
      await loadTopics();
      setPostMeetingOpen(false);
    } catch (err) {
      toast_(err.message || "Failed to save post-meeting update.");
    } finally {
      setSyncing(false);
    }
  }

  const openTopics = topics.filter(t => !isClosed(t));
  const closedTopics = topics.filter(t => isClosed(t));

  // MEMBERS
  if (view === "members") return (
    <Page title="Board Members" onBack={() => setView("home")}>
      {members.map((m, i) => (
        <div key={m} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", border: "1px solid #ddd", borderRadius: 8, background: "#fff" }}>
          <span style={{ fontSize: 16, fontFamily: OPEN }}>{m}</span>
          <button onClick={() => setMembers(p => p.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#c0392b", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>X</button>
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
          onPaste={handlePaste}
          data-placeholder="Additional context..."
          style={{ minHeight: 90, padding: "10px 14px", fontSize: 15, fontFamily: OPEN, outline: "none", lineHeight: 1.6, color: "#1a1a1a" }}
        />
      </div>
      <label style={lStyle}>Submitted by (optional)</label>
      <input value={form.submittedBy} onChange={e => setForm(p => ({ ...p, submittedBy: e.target.value }))}
        placeholder="Name" style={iStyle} />
      <label style={lStyle}>Meeting / Reveal Date (optional) - results visible after this date</label>
      <input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} style={iStyle} />
      <label style={lStyle}>Attachment (optional)</label>
      <label style={{ display: "flex", alignItems: "center", gap: 12, border: `2px dashed ${uploadStatus === "done" ? "#1a7a1a" : uploadStatus === "error" ? "#c0392b" : "#ccc"}`, borderRadius: 8, padding: "12px 16px", cursor: uploadStatus === "uploading" ? "default" : "pointer", background: "#fafafa" }}>
        <input type="file" onChange={handleFileUpload} style={{ display: "none" }} disabled={uploadStatus === "uploading"} />
        <span style={{ background: uploadStatus === "done" ? "#1a7a1a" : GOLD, color: "#fff", borderRadius: 6, padding: "6px 14px", fontSize: 14, fontWeight: "600", fontFamily: OPEN, whiteSpace: "nowrap" }}>
          {uploadStatus === "uploading" ? "Uploading..." : uploadStatus === "done" ? "Uploaded" : "Upload to Drive"}
        </span>
        <span style={{ fontSize: 14, fontFamily: OPEN, color: form.fileName ? "#1a1a1a" : "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {uploadStatus === "uploading" ? "Saving to Board Voting folder..." : form.fileName || "No file chosen"}
        </span>
        {uploadStatus === "done" && <button type="button" onClick={e => { e.preventDefault(); setForm(p => ({ ...p, fileUrl: "", fileName: "" })); setUploadStatus("idle"); }} style={{ marginLeft: "auto", background: "none", border: "none", color: "#c0392b", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 0 }}>X</button>}
      </label>
      <button onClick={submitTopic} disabled={syncing} style={{ ...btnStyle, width: "100%", padding: "14px", marginTop: 4, opacity: syncing ? 0.6 : 1 }}>
        {syncing ? "Saving..." : "Submit Topic"}
      </button>
    </Page>
  );

  // EDIT TOPIC
  if (view === "edit" && sel) return (
    <Page title="Edit Topic" onBack={() => setView("topic")}>
      <label style={lStyle}>Title *</label>
      <input value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} style={iStyle} />
      <label style={lStyle}>Description (optional)</label>
      <div style={{ border: "2px solid #ccc", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 4, padding: "6px 8px", background: "#f5f5f5", borderBottom: "1px solid #ddd" }}>
          <button type="button" onMouseDown={e => { e.preventDefault(); applyFormat("bold", editDescRef); }} style={{ fontWeight: "700", fontSize: 14, fontFamily: OPEN, background: "#fff", border: "1px solid #ccc", borderRadius: 4, padding: "2px 10px", cursor: "pointer" }}>B</button>
          <button type="button" onMouseDown={e => { e.preventDefault(); applyFormat("italic", editDescRef); }} style={{ fontStyle: "italic", fontSize: 14, fontFamily: OPEN, background: "#fff", border: "1px solid #ccc", borderRadius: 4, padding: "2px 10px", cursor: "pointer" }}>I</button>
        </div>
        <div
          ref={editDescRef}
          contentEditable
          suppressContentEditableWarning
          onPaste={handlePaste}
          data-placeholder="Additional context..."
          style={{ minHeight: 90, padding: "10px 14px", fontSize: 15, fontFamily: OPEN, outline: "none", lineHeight: 1.6, color: "#1a1a1a" }}
        />
      </div>
      <label style={lStyle}>Submitted by (optional)</label>
      <input value={editForm.submittedBy} onChange={e => setEditForm(p => ({ ...p, submittedBy: e.target.value }))}
        placeholder="Name" style={iStyle} />
      <label style={lStyle}>Meeting / Reveal Date (optional) - results visible after this date</label>
      <input type="date" value={editForm.dueDate} onChange={e => setEditForm(p => ({ ...p, dueDate: e.target.value }))} style={iStyle} />
      <label style={lStyle}>Attachment (optional)</label>
      <label style={{ display: "flex", alignItems: "center", gap: 12, border: `2px dashed ${editUploadStatus === "done" ? "#1a7a1a" : editUploadStatus === "error" ? "#c0392b" : "#ccc"}`, borderRadius: 8, padding: "12px 16px", cursor: editUploadStatus === "uploading" ? "default" : "pointer", background: "#fafafa" }}>
        <input type="file" onChange={e => handleFileUpload(e, true)} style={{ display: "none" }} disabled={editUploadStatus === "uploading"} />
        <span style={{ background: editUploadStatus === "done" ? "#1a7a1a" : GOLD, color: "#fff", borderRadius: 6, padding: "6px 14px", fontSize: 14, fontWeight: "600", fontFamily: OPEN, whiteSpace: "nowrap" }}>
          {editUploadStatus === "uploading" ? "Uploading..." : editUploadStatus === "done" ? "Uploaded" : "Upload to Drive"}
        </span>
        <span style={{ fontSize: 14, fontFamily: OPEN, color: editForm.fileName ? "#1a1a1a" : "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {editUploadStatus === "uploading" ? "Saving to Board Voting folder..." : editForm.fileName || "No file chosen"}
        </span>
        {editUploadStatus === "done" && <button type="button" onClick={e => { e.preventDefault(); setEditForm(p => ({ ...p, fileUrl: "", fileName: "" })); setEditUploadStatus("idle"); }} style={{ marginLeft: "auto", background: "none", border: "none", color: "#c0392b", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 0 }}>X</button>}
      </label>
      <button onClick={updateTopic} disabled={syncing} style={{ ...btnStyle, width: "100%", padding: "14px", marginTop: 4, opacity: syncing ? 0.6 : 1 }}>
        {syncing ? "Saving..." : "Save Changes"}
      </button>
    </Page>
  );

  // TOPIC DETAIL
  if (view === "topic" && sel) {
    const closed = isClosed(sel);
    const votingLocked = isVotingLocked(sel);
    const pastDue = isPastDue(sel);
    const voteCount = Object.keys(sel.votes || {}).length;
    const tally = { Yes: 0, No: 0, Abstain: 0, "Not in attendance": 0 };
    Object.values(sel.votes || {}).forEach(v => { if (tally[v.choice] !== undefined) tally[v.choice]++; });
    const voterAlreadyVoted = voteForm.voter && sel.votes?.[voteForm.voter];

    return (
      <Page title="" onBack={() => { setVoteForm({ voter: "", choice: "", note: "" }); setView("home"); }}>
        {/* Topic Info Box */}
        <div style={{ borderLeft: `4px solid ${GOLD}`, borderRadius: 4, background: "#fff", padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 10, fontWeight: "700", fontFamily: OPEN, textTransform: "uppercase", letterSpacing: 2, color: GOLD }}>Item Topic</div>
          <div style={{ fontSize: 19, fontWeight: "800", fontFamily: OPEN, color: "#1a1a1a", lineHeight: 1.3 }}>{sel.title}</div>

          {sel.description && (
            /<[a-z]/i.test(sel.description)
              ? <p style={{ fontSize: 15, fontFamily: OPEN, color: "#444", lineHeight: 1.7, margin: 0, borderTop: "1px solid #eee", paddingTop: 14 }} dangerouslySetInnerHTML={{ __html: sel.description }} />
              : <p style={{ fontSize: 15, fontFamily: OPEN, color: "#444", lineHeight: 1.7, margin: 0, borderTop: "1px solid #eee", paddingTop: 14 }}>{renderText(sel.description)}</p>
          )}

          {sel.fileUrl && (
            <div style={{ borderTop: "1px solid #eee", paddingTop: 14 }}>
              <a href={sel.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: "600", fontFamily: OPEN, color: GOLD, textDecoration: "none" }}>
                Attachment: {sel.fileName || "View attachment"}
              </a>
            </div>
          )}
          {sel.submittedBy && (
            <div style={{ alignSelf: "flex-end", fontSize: 12, fontFamily: OPEN, color: "#666" }}>
              Submitted by: <strong style={{ color: "#444" }}>{sel.submittedBy}</strong>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4, alignItems: "center" }}>
          <Badge color={votingLocked ? "#555" : pastDue ? "#c06000" : "#1a7a1a"}>
            {votingLocked ? "CLOSED" : pastDue ? "PAST DUE" : "OPEN"}
          </Badge>
          <Badge color={GOLD}>{voteCount} / {BOARD_MEMBER_COUNT} voted</Badge>
          {sel.dueDate && <Badge color={GOLD}>Meeting: {fmtDate(sel.dueDate)}</Badge>}
          <button onClick={() => {
            setEditForm({
              title: sel.title,
              description: sel.description || "",
              submittedBy: sel.submittedBy || "",
              dueDate: sel.dueDate || "",
              fileUrl: sel.fileUrl || "",
              fileName: sel.fileName || "",
            });
            setEditUploadStatus(sel.fileUrl ? "done" : "idle");
            setView("edit");
          }} style={{ ...outlineBtn, marginLeft: "auto", padding: "4px 12px", fontSize: 13 }}>Edit</button>
        </div>

        {/* Results */}
        <div style={{ border: "2px solid #ddd", borderRadius: 10, padding: 20, background: "#fff" }}>
          {closed ? (
            <>
              <div style={{ fontWeight: "700", fontSize: 17, fontFamily: SERIF, marginBottom: 14, color: "#1a1a1a" }}>Final Results</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
                {POST_MEETING_VOTE_CHOICES.map(c => (
                  <div key={c} style={{ textAlign: "center", padding: "12px 8px", background: "#fff", borderRadius: 8, border: "1px solid #eee" }}>
                    <div style={{ fontSize: 30, fontWeight: "700", fontFamily: SERIF, color: CHOICE_COLOR[c] }}>{tally[c]}</div>
                    <div style={{ fontSize: 13, fontFamily: OPEN, color: "#555", marginTop: 2 }}>{c}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontWeight: "700", fontSize: 15, fontFamily: SERIF, marginBottom: 10, color: "#1a1a1a" }}>Individual Votes</div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 180px) minmax(0, 1fr) 128px", gap: 16, padding: "0 0 8px", borderBottom: "1px solid #e6e6e6", marginBottom: 2 }}>
                <div style={{ fontSize: 11, fontWeight: "700", fontFamily: OPEN, textTransform: "uppercase", letterSpacing: 1.1, color: "#8a8a8a" }}>Member</div>
                <div style={{ fontSize: 11, fontWeight: "700", fontFamily: OPEN, textTransform: "uppercase", letterSpacing: 1.1, color: "#8a8a8a" }}>Notes</div>
                <div style={{ fontSize: 11, fontWeight: "700", fontFamily: OPEN, textTransform: "uppercase", letterSpacing: 1.1, color: "#8a8a8a", textAlign: "right" }}>Vote</div>
              </div>
              {members.map(m => {
                const v = sel.votes?.[m];
                const meetingChange = v?.note?.includes("[Changed in meeting");
                const prevMatch = v?.note?.match(/\[Changed in meeting - was: ([^\]]+)\]/);
                const previousChoice = prevMatch?.[1];
                const displayNote = v?.note
                  ? v.note.replace(/ - \[Changed in meeting[^\]]*\]/, "").replace(/\[Changed in meeting[^\]]*\]/, "").trim()
                  : undefined;
                return (
                  <div key={m} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 180px) minmax(0, 1fr) 128px", gap: 16, alignItems: "start", padding: "12px 0", borderTop: "1px solid #eee" }}>
                    <div style={{ fontWeight: "600", fontSize: 15, fontFamily: OPEN, color: "#1a1a1a", minHeight: 24, display: "flex", alignItems: "center" }}>
                      {m}
                    </div>
                    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      {(meetingChange || previousChoice) && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minHeight: 20 }}>
                          {meetingChange ? <span style={{ fontSize: 11, fontWeight: "600", padding: "2px 8px", borderRadius: 12, background: "#fff3cd", color: "#856404", border: "1px solid #856404", whiteSpace: "nowrap" }}>Changed in meeting</span> : null}
                          {previousChoice ? <span style={{ fontSize: 12, fontFamily: OPEN, color: "#888" }}>Previously: <span style={{ color: CHOICE_COLOR[previousChoice], fontWeight: "600", textDecoration: "line-through" }}>{previousChoice}</span></span> : null}
                        </div>
                      )}
                      {displayNote ? <div style={{ color: "#555", fontSize: 13, fontFamily: OPEN, lineHeight: 1.5 }}>{displayNote}</div> : <div style={{ minHeight: 20 }} />}
                    </div>
                    <div style={{ minHeight: 24, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                      <span style={{ fontWeight: "700", fontFamily: OPEN, color: v ? CHOICE_COLOR[v.choice] : "#aaa", fontSize: 15, whiteSpace: "nowrap", textAlign: "right" }}>
                        {v ? v.choice : "-"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div style={{ fontSize: 15, fontFamily: OPEN, color: "#333" }}>
              <strong>{voteCount}</strong> of <strong>{BOARD_MEMBER_COUNT}</strong> have voted. Results are hidden until voting closes.
            </div>
          )}
        </div>

        {/* Vote form */}
        {!votingLocked && (
          <div style={{ border: `2px solid ${GOLD}`, borderRadius: 10, padding: 20, background: "#fff" }}>
            <div style={{ fontWeight: "700", fontSize: 17, fontFamily: SERIF, marginBottom: pastDue ? 10 : 16, color: "#1a1a1a" }}>
              {pastDue ? "Add Post-Meeting Votes" : "Cast a Vote"}
            </div>
            {pastDue && (
              <div style={{ background: "#fff3cd", border: "1px solid #856404", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontFamily: OPEN, color: "#856404", marginBottom: 16 }}>
                Warning: The meeting date has passed. Votes will be marked as <strong>Changed in meeting</strong>. Members who voted electronically can also change their vote here.
              </div>
            )}
            <label style={{ ...lStyle, display: "block", marginBottom: 14 }}>Who is voting?</label>
            <select value={voteForm.voter} onChange={e => setVoteForm(p => ({ ...p, voter: e.target.value, choice: "", note: "" }))} style={{ ...iStyle, marginBottom: 14, color: voteForm.voter ? "#1a1a1a" : "#999" }}>
              <option value="">-- Select your name --</option>
              {members.map(m => {
                const voted = !!sel.votes?.[m];
                // When past due, allow re-voting (vote changed in meeting)
                const isDisabled = voted && !pastDue;
                return (
                  <option key={m} value={m} disabled={isDisabled} style={{ color: isDisabled ? "#bbb" : "#222" }}>
                    {m}{voted ? (pastDue ? " (change vote)" : " (voted)") : ""}
                  </option>
                );
              })}
            </select>

            {voteForm.voter && (!voterAlreadyVoted || pastDue) && (
              <>
                {voterAlreadyVoted && pastDue && (
                  <div style={{ background: "#f5f0e8", border: `1px solid ${GOLD}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, fontFamily: OPEN, color: "#555", marginBottom: 14 }}>
                    Previously voted <strong style={{ color: CHOICE_COLOR[sel.votes[voteForm.voter].choice] }}>{sel.votes[voteForm.voter].choice}</strong>. Select a new vote below to change it.
                  </div>
                )}
                <label style={lStyle}>Your vote</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {(pastDue ? POST_MEETING_VOTE_CHOICES : STANDARD_VOTE_CHOICES).map(c => (
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
                }}>{syncing ? "Saving..." : pastDue ? "Submit Post-Meeting Vote" : "Submit Vote"}</button>
              </>
            )}

            {voterAlreadyVoted && !pastDue && (
              <div style={{ background: "#f0f0f0", borderRadius: 8, padding: "12px 16px", fontSize: 15, fontFamily: OPEN, color: "#555" }}>
                <strong>{voteForm.voter}</strong> has already voted <strong style={{ color: CHOICE_COLOR[sel.votes[voteForm.voter].choice] }}>{sel.votes[voteForm.voter].choice}</strong> on this topic.
              </div>
            )}
          </div>
        )}

        {(pastDue || closed) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {!postMeetingOpen && (
              <>
                {(sel.overallConsensus || sel.stipulations || sel.nextSteps) && (
                  <div style={{ border: "2px solid #e4d8c4", borderRadius: 10, padding: 20, background: "#fffdf9", display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ fontWeight: "700", fontSize: 17, fontFamily: SERIF, color: "#1a1a1a" }}>Post-Meeting Updates</div>
                    {sel.overallConsensus && <ConsensusBlock label="Consensus" text={sel.overallConsensus} />}
                    {sel.stipulations && <ConsensusBlock label="Stipulations" text={sel.stipulations} />}
                    {sel.nextSteps && <ConsensusBlock label="Next Steps" text={sel.nextSteps} />}
                  </div>
                )}
                <button onClick={() => setPostMeetingOpen(true)} style={{ ...outlineBtn, width: "100%", padding: "14px" }}>
                  {sel.overallConsensus || sel.stipulations || sel.nextSteps ? "Edit Post-Meeting Updates" : "Add Post-Meeting Updates"}
                </button>
              </>
            )}

            {postMeetingOpen && (
              <div style={{ border: "2px solid #e4d8c4", borderRadius: 10, padding: 20, background: "#fffdf9", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontWeight: "700", fontSize: 17, fontFamily: SERIF, color: "#1a1a1a" }}>Post-Meeting Updates</div>
                <label style={lStyle}>Overall consensus</label>
                <textarea value={postMeetingForm.overallConsensus} onChange={e => setPostMeetingForm(p => ({ ...p, overallConsensus: e.target.value }))} rows={3} placeholder="Summary of the board's overall consensus..." style={iStyle} />
                <label style={lStyle}>Stipulations</label>
                <textarea value={postMeetingForm.stipulations} onChange={e => setPostMeetingForm(p => ({ ...p, stipulations: e.target.value }))} rows={3} placeholder="Conditions, caveats, or required stipulations..." style={iStyle} />
                <label style={lStyle}>Next steps</label>
                <textarea value={postMeetingForm.nextSteps} onChange={e => setPostMeetingForm(p => ({ ...p, nextSteps: e.target.value }))} rows={3} placeholder="Follow-up actions, owners, or deadlines..." style={iStyle} />
                <button onClick={savePostMeetingUpdate} disabled={syncing} style={{ ...btnStyle, width: "100%", padding: "14px", opacity: syncing ? 0.6 : 1 }}>
                  {syncing ? "Saving..." : "Save Post-Meeting Updates"}
                </button>
                <button
                  onClick={() => {
                    setPostMeetingForm({
                      overallConsensus: sel.overallConsensus || "",
                      stipulations: sel.stipulations || "",
                      nextSteps: sel.nextSteps || "",
                    });
                    setPostMeetingOpen(false);
                  }}
                  style={{ ...outlineBtn, width: "100%", padding: "14px" }}
                >
                  Cancel
                </button>
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
        <div style={{ textAlign: "center", fontFamily: OPEN, color: "#888", padding: "60px 0", fontSize: 15 }}>Loading...</div>
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
        <div style={{ fontSize: 13, fontFamily: OPEN, color: "#666", marginTop: 3 }}>{voteCount} / {BOARD_MEMBER_COUNT} voted - {fmtDate(t.dueDate)}</div>
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
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", padding: 0, lineHeight: 1, opacity: 0.85, position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)" }}>&lt;</button>
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

function ConsensusBlock({ label, text }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: "700", fontFamily: OPEN, textTransform: "uppercase", letterSpacing: 1.2, color: GOLD }}>{label}</div>
      <div style={{ fontSize: 15, fontFamily: OPEN, color: "#444", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{text}</div>
    </div>
  );
}

const btnStyle = { background: GOLD, color: "#fff", border: "none", borderRadius: 8, padding: "12px 18px", fontSize: 15, cursor: "pointer", fontFamily: OPEN, fontWeight: "600" };
const outlineBtn = { background: "#fff", border: `2px solid ${GOLD}`, borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer", fontFamily: OPEN, color: GOLD, fontWeight: "600" };
const iStyle = { width: "100%", border: "2px solid #ccc", borderRadius: 8, padding: "10px 14px", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: OPEN };
const lStyle = { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 2, fontFamily: OPEN };
const secLabel = { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.5, color: GOLD, marginBottom: 10, fontFamily: OPEN };




"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { canAddKnowledgeChild, createNote, KNOWLEDGE_LEVELS, knowledgeLevel, type Note, type NoteKind } from "@qvill/shared";
import { listNotes, removeNote, saveNote } from "@/lib/storage";

type Section = "inbox" | "journal" | "knowledge" | "pdfs";
const dateLabel = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" });
const today = () => new Date().toISOString().slice(0, 10);
const relativeTime = (value: string) => {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, ReactNode> = {
    inbox: <><path d="M4 4h16v15H4z"/><path d="M4 13h4l2 3h4l2-3h4"/></>,
    calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 10h17"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01"/></>,
    tree: <><rect x="9" y="3" width="6" height="5" rx="1.5"/><rect x="3" y="16" width="6" height="5" rx="1.5"/><rect x="15" y="16" width="6" height="5" rx="1.5"/><path d="M12 8v4M6 16v-4h12v4"/></>,
    file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 4.5 4.5"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    pin: <><path d="m8 4 8 0-1 5 3 3v2H6v-2l3-3zM12 14v7"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    back: <><path d="m15 18-6-6 6-6"/><path d="M9 12h11"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    share: <><path d="M12 15V3m-4 4 4-4 4 4"/><path d="M5 13v7h14v-7"/></>
  };
  return <svg {...common}>{paths[name] ?? paths.file}</svg>;
}

function displayKind(kind: NoteKind) { return ({ quick: "Quick note", journal: "Daily journal", knowledge: "Knowledge page", pdf: "PDF document" })[kind]; }
function displayNoteKind(note: Note, notes: Note[]) { return note.kind === "knowledge" ? `${knowledgeLevel(note.id, notes)} page` : displayKind(note.kind); }
function hierarchyIcon(level: string) { return level.toLowerCase(); }
function excerpt(body: string) { return body.replace(/[#>*_`\[\]]/g, " ").replace(/\s+/g, " ").trim(); }

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("inbox");
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState("");
  const [treeMenu, setTreeMenu] = useState<{ x: number; y: number; nodeId: string; depth: number } | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const active = notes.find((note) => note.id === activeId) ?? null;

  useEffect(() => {
    listNotes().then((stored) => { setNotes(stored); setReady(true); }).catch(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!active?.attachmentData) { setPdfUrl(""); return; }
    const url = URL.createObjectURL(active.attachmentData);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [active?.attachmentData]);

  const persist = useCallback(async (note: Note) => {
    setNotes((current) => {
      const exists = current.some((item) => item.id === note.id);
      return exists ? current.map((item) => item.id === note.id ? note : item).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [note, ...current];
    });
    setSaved(false);
    try { await saveNote(note); setSaved(true); }
    catch { setToast("Couldn’t save on this device. Check browser storage settings."); window.setTimeout(() => setToast(""), 4200); }
  }, []);

  const create = useCallback((kind: NoteKind, parentId: string | null = null) => {
    if (kind === "knowledge" && parentId && !canAddKnowledgeChild(parentId, notes)) {
      setToast("Fruit pages are the last level and cannot have child pages.");
      window.setTimeout(() => setToast(""), 3000);
      return;
    }
    const note = createNote(kind, parentId);
    if (kind === "knowledge") note.title = `${parentId ? KNOWLEDGE_LEVELS[Math.min(KNOWLEDGE_LEVELS.indexOf(knowledgeLevel(parentId, notes)) + 1, KNOWLEDGE_LEVELS.length - 1)] : KNOWLEDGE_LEVELS[0]} page`;
    if (kind === "journal") {
      const existing = notes.find((item) => item.kind === "journal" && item.entryDate === today());
      if (existing) { setSection("journal"); setActiveId(existing.id); return; }
    }
    void persist(note); setActiveId(note.id); setSection(kind === "journal" ? "journal" : kind === "knowledge" ? "knowledge" : kind === "pdf" ? "pdfs" : "inbox");
    if (parentId) setExpanded((value) => ({ ...value, [parentId]: true }));
    window.setTimeout(() => titleRef.current?.focus(), 60);
  }, [notes, persist]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;
      if (event.key.toLowerCase() === "n") { event.preventDefault(); create("quick"); }
      if (event.key.toLowerCase() === "k") { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [create]);

  useEffect(() => {
    if (!treeMenu) return;
    const closeOnOutsideClick = () => setTreeMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setTreeMenu(null); };
    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [treeMenu]);

  const update = (changes: Partial<Note>) => {
    if (!active) return;
    void persist({ ...active, ...changes, updatedAt: new Date().toISOString() });
  };

  const visibleNotes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return notes.filter((note) => {
      if (note.archived) return false;
      if (section === "journal" && note.kind !== "journal") return false;
      if (section === "knowledge" && note.kind !== "knowledge") return false;
      if (section === "pdfs" && note.kind !== "pdf") return false;
      if (section === "inbox" && note.kind !== "quick" && note.kind !== "knowledge") return false;
      if (!needle) return true;
      return `${note.title} ${note.body} ${note.tags.join(" ")}`.toLowerCase().includes(needle);
    });
  }, [notes, query, section]);

  const tree = useMemo(() => {
    const knowledge = notes.filter((n) => n.kind === "knowledge" && !n.archived);
    const children = new Map<string | null, Note[]>();
    knowledge.forEach((note) => { const key = note.parentId && knowledge.some((p) => p.id === note.parentId) ? note.parentId : null; children.set(key, [...(children.get(key) ?? []), note]); });
    children.forEach((items) => items.sort((a, b) => a.title.localeCompare(b.title)));
    return children;
  }, [notes]);

  const chooseSection = (next: Section) => { setSection(next); setMobileMenu(false); if (next !== "knowledge") setQuery(""); };
  const notify = (text: string) => { setToast(text); window.setTimeout(() => setToast(""), 3000); };
  const togglePin = () => active && update({ pinned: !active.pinned });
  const deleteActive = async () => {
    if (!active) return;
    const id = active.id; await removeNote(id); setNotes((items) => items.filter((item) => item.id !== id)); setActiveId(null); notify("Note moved to trash");
  };
  const newPDF = async (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { notify("Choose a PDF file to import."); return; }
    const pdf = createNote("pdf"); pdf.title = file.name.replace(/\.pdf$/i, "") || "Imported PDF"; pdf.attachmentName = file.name; pdf.attachmentType = file.type || "application/pdf"; pdf.attachmentData = file;
    void persist(pdf); setActiveId(pdf.id); setSection("pdfs");
  };
  const exportMarkdown = () => {
    if (!active) return;
    const content = `# ${active.title}\n\n${active.body}\n`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${active.title.trim().replace(/[^\w-]+/g, "-") || "qvill-note"}.md`; a.click(); URL.revokeObjectURL(a.href);
    notify("Markdown export downloaded");
  };
  const exportPDF = () => { if (!active) return; window.print(); };
  const shareNote = async () => {
    if (!active) return;
    if (active.kind === "pdf" && active.attachmentData) {
      const file = new File([active.attachmentData], active.attachmentName ?? "qvill-document.pdf", { type: "application/pdf" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ title: active.title, files: [file] }); } catch { /* user cancelled */ }
      } else if (pdfUrl) {
        window.open(pdfUrl, "_blank", "noopener,noreferrer");
        notify("Opened the original PDF");
      }
      return;
    }
    const shareText = `${active.title}\n\n${active.body}`;
    if (navigator.share) { try { await navigator.share({ title: active.title, text: shareText }); } catch { /* user cancelled */ } }
    else { await navigator.clipboard?.writeText(shareText); notify("Note copied to clipboard"); }
  };

  const navItem = (id: Section, icon: string, label: string, count?: number) => <button className={`nav-item ${section === id ? "selected" : ""}`} onClick={() => chooseSection(id)} key={id}><Icon name={icon}/><span>{label}</span>{count !== undefined && count > 0 && <small>{count}</small>}</button>;
  const renderTree = (parentId: string | null, depth = 0): ReactNode => (tree.get(parentId) ?? []).map((node) => <div key={node.id}>
    <div className={`tree-row ${activeId === node.id ? "current" : ""}`} style={{ paddingLeft: 10 + depth * 15 }} onContextMenu={(event) => {
      event.preventDefault();
      setTreeMenu({ x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 70), nodeId: node.id, depth });
    }}>
      <button className="tree-toggle" onClick={() => setExpanded((v) => ({ ...v, [node.id]: !v[node.id] }))} aria-label={expanded[node.id] ? "Collapse folder" : "Expand folder"}>{tree.has(node.id) ? <span>{expanded[node.id] ? "⌄" : "›"}</span> : <span className="tree-spacer"/>}</button>
      <img className="hierarchy-icon" src={`/hierarchy/${hierarchyIcon(KNOWLEDGE_LEVELS[depth] ?? "Fruit")}.png`} alt=""/><button className="tree-title" onClick={() => { setActiveId(node.id); setSection("knowledge"); }}>{node.title || "Untitled page"}</button><span className="tree-level">{KNOWLEDGE_LEVELS[depth] ?? "Fruit"}</span>{depth < KNOWLEDGE_LEVELS.length - 1 && <button className="child-add" title={`Add ${KNOWLEDGE_LEVELS[depth + 1]} page`} onClick={() => create("knowledge", node.id)}><Icon name="plus" size={13}/></button>}
    </div>
    {expanded[node.id] && depth < KNOWLEDGE_LEVELS.length - 1 && renderTree(node.id, depth + 1)}
  </div>);

  return <main className="app-shell">
    <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
      <div className="brand"><div className="brand-mark">Q</div><div><strong>Qvill</strong><span>your space to think</span></div><button className="sidebar-close" onClick={() => setMobileMenu(false)} aria-label="Close navigation"><Icon name="close"/></button></div>
      <button className="primary-create" onClick={() => create("quick")}><Icon name="plus"/> <span>New note</span><kbd>⌘ N</kbd></button>
      <div className="nav-label">WORKSPACE</div>
      <nav className="main-nav">
        {navItem("inbox", "inbox", "All notes", notes.filter((n) => !n.archived && (n.kind === "quick" || n.kind === "knowledge")).length)}
        {navItem("journal", "calendar", "Daily journal", notes.filter((n) => !n.archived && n.kind === "journal").length)}
        {navItem("knowledge", "tree", "Knowledge base", notes.filter((n) => !n.archived && n.kind === "knowledge").length)}
        {navItem("pdfs", "file", "PDF library", notes.filter((n) => !n.archived && n.kind === "pdf").length)}
      </nav>
      <div className="tree-header"><span>YOUR PAGES</span><button onClick={() => create("knowledge")} title="Add a knowledge page"><Icon name="plus" size={15}/></button></div>
      <div className="tree-list">{renderTree(null)}{!tree.size && <p className="tree-empty">Your pages will appear here</p>}</div>
      {treeMenu && <div className="tree-context-menu" role="menu" style={{ left: treeMenu.x, top: treeMenu.y }} onMouseDown={(event) => event.stopPropagation()}>
        {treeMenu.depth < KNOWLEDGE_LEVELS.length - 1 ? <button role="menuitem" onClick={() => { setTreeMenu(null); create("knowledge", treeMenu.nodeId); }}>＋ Add {KNOWLEDGE_LEVELS[treeMenu.depth + 1]} page</button> : <span>Fruit is the last level</span>}
      </div>}
      <div className="sidebar-bottom"><div className="sync-indicator"><span className="sync-dot"/><div><strong>Saved on this device</strong><small>{saved ? "Browser storage" : "Saving changes…"}</small></div></div><div className="profile"><div className="avatar">Q</div><div><strong>My workspace</strong><small>Personal space</small></div><button aria-label="Workspace options"><Icon name="more"/></button></div></div>
    </aside>
    {mobileMenu && <button className="scrim" onClick={() => setMobileMenu(false)} aria-label="Close navigation"/>}
    <section className="workspace">
      <header className="topbar"><button className="mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Open navigation"><span>☰</span></button><div className="breadcrumbs"><span>Workspace</span><Icon name="chevron" size={14}/><strong>{section === "inbox" ? "All notes" : section === "journal" ? "Daily journal" : section === "knowledge" ? "Knowledge base" : "PDF library"}</strong></div><div className="top-actions"><div className="search-box"><Icon name="search" size={17}/><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes…" aria-label="Search notes"/><kbd>⌘ K</kbd></div><button className="avatar top-avatar" title="My workspace">Q</button></div></header>
      <div className={`content-layout ${active ? "has-editor" : ""}`}>
        <section className="list-pane">
          <div className="page-heading"><div><div className="date-line">{dateLabel.format(new Date())}</div><h1>{section === "inbox" ? "A little space to think." : section === "journal" ? "Your daily journal" : section === "knowledge" ? "Knowledge base" : "Your PDFs"}</h1><p>{section === "inbox" ? "Capture a thought, then let it find its place." : section === "journal" ? "One day at a time. Your thoughts, in your words." : section === "knowledge" ? "Tree → Branches → Leaf → Flower → Fruit. Fruit is the last level." : "Your documents, notes, and ideas together."}</p></div><button className="heading-more" title="More options"><Icon name="more"/></button></div>
          <div className="list-toolbar"><span>{query ? `${visibleNotes.length} SEARCH RESULT${visibleNotes.length === 1 ? "" : "S"}` : section === "journal" ? "RECENT ENTRIES" : section === "pdfs" ? "DOCUMENTS" : section === "knowledge" ? "PAGES" : "RECENT NOTES"}</span>{!(section === "knowledge" && active?.kind === "knowledge" && !canAddKnowledgeChild(active.id, notes)) && <button onClick={() => section === "journal" ? create("journal") : section === "knowledge" ? create("knowledge", active?.kind === "knowledge" ? active.id : null) : section === "pdfs" ? document.getElementById("pdf-upload")?.click() : create("quick")}><Icon name="plus" size={15}/>{section === "journal" ? "Today’s entry" : section === "knowledge" ? "+ child node" : section === "pdfs" ? "Import PDF" : "New note"}</button>}<input id="pdf-upload" type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { void newPDF(e.target.files?.[0]); e.target.value = ""; }}/></div>
          <div className="note-list">
            {!ready ? <div className="loading-state">Opening your workspace…</div> : visibleNotes.length === 0 ? <div className="empty-state"><div className="empty-icon">{section === "journal" ? <Icon name="calendar" size={24}/> : section === "knowledge" ? <Icon name="tree" size={24}/> : section === "pdfs" ? <Icon name="file" size={24}/> : <Icon name="inbox" size={24}/>}</div><h2>{query ? "No notes found" : section === "journal" ? "Your journal starts here" : section === "knowledge" ? "Make your first page" : section === "pdfs" ? "No PDFs yet" : "Start with a small thought"}</h2><p>{query ? "Try another search, or create a note with that idea." : section === "pdfs" ? "Import a PDF to keep it with your notes." : "Everything you write is saved on this device as you go."}</p>{!query && <button className="empty-cta" onClick={() => section === "journal" ? create("journal") : section === "knowledge" ? create("knowledge") : section === "pdfs" ? document.getElementById("pdf-upload")?.click() : create("quick")}><Icon name="plus" size={16}/>{section === "journal" ? "Write today’s entry" : section === "knowledge" ? "Create a page" : section === "pdfs" ? "Import a PDF" : "Create your first note"}</button>}</div> : visibleNotes.map((note) => <button className={`note-card ${activeId === note.id ? "active" : ""}`} key={note.id} onClick={() => setActiveId(note.id)}><span className={`note-kind ${note.kind}`}><span/>{displayNoteKind(note, notes)}</span><div className="note-card-title">{note.pinned && <span className="pinned-mark">⌑ </span>}{note.title || "Untitled note"}</div><p>{note.kind === "pdf" ? note.attachmentName ?? "PDF attachment" : excerpt(note.body) || "No text yet — open this note to add your thoughts."}</p><div className="note-card-meta"><span><Icon name="clock" size={13}/>{relativeTime(note.updatedAt)}</span>{note.tags.slice(0, 2).map((tag) => <i key={tag}>{tag}</i>)}</div></button>)}
          </div>
          <div className="list-footer">{visibleNotes.length > 0 && <span>{visibleNotes.length} {visibleNotes.length === 1 ? "item" : "items"}</span>}<span>Private to your workspace</span></div>
        </section>
        <section className="editor-pane">
          {active ? <>
            <div className="editor-toolbar"><button className="back-to-list" onClick={() => setActiveId(null)}><Icon name="back" size={16}/><span>Back to notes</span></button>{active.kind === "knowledge" && canAddKnowledgeChild(active.id, notes) && <button className="child-node-button" onClick={() => create("knowledge", active.id)}>+ child node</button>}<div className="editor-tools"><span className={`save-status ${saved ? "" : "saving"}`}><i/>{saved ? "Saved" : "Saving"}</span><button className={`tool-button ${active.pinned ? "is-pinned" : ""}`} title={active.pinned ? "Unpin note" : "Pin note"} onClick={togglePin}><Icon name="pin" size={16}/></button><button className="tool-button" title="Share note" onClick={() => void shareNote()}><Icon name="share" size={16}/></button><div className="menu-wrap"><details><summary className="tool-button" aria-label="More actions"><Icon name="more" size={17}/></summary><div className="action-menu"><button onClick={exportMarkdown}>Export as Markdown</button><button onClick={exportPDF}>Print / save as PDF</button><button className="danger" onClick={() => void deleteActive()}>Move to trash</button></div></details></div></div></div>
            <article className="editor-document">
              <div className="editor-meta"><span className={`note-kind ${active.kind}`}>{active.kind === "knowledge" && <img className="hierarchy-icon" src={`/hierarchy/${hierarchyIcon(knowledgeLevel(active.id, notes))}.png`} alt=""/>}<span/>{displayNoteKind(active, notes)}</span>{active.kind === "journal" && <span className="entry-date">{active.entryDate ?? today()}</span>}{active.parentId && <span className="parent-crumb">in {notes.find((n) => n.id === active.parentId)?.title ?? "Knowledge base"}</span>}</div>
              <input ref={titleRef} className="title-input" value={active.title} onChange={(e) => update({ title: e.target.value })} placeholder="Untitled note" aria-label="Note title" />
              {active.kind === "pdf" ? <div className="pdf-document"><div className="pdf-toolbar"><span><Icon name="file" size={16}/>{active.attachmentName ?? "PDF file"}</span><button onClick={() => pdfUrl && window.open(pdfUrl, "_blank", "noopener,noreferrer")}>Open original <Icon name="share" size={14}/></button></div>{pdfUrl ? <iframe title={active.attachmentName ?? "Imported PDF"} src={pdfUrl}/> : <div className="pdf-placeholder">The original PDF is stored with this item.</div>}<div className="pdf-convert"><strong>Want to work with the text?</strong><p>PDF text extraction and annotation tools are part of the document workflow.</p><button onClick={() => notify("PDF text extraction is coming in the document-processing phase.")}>Convert to editable note</button></div></div> : <><div className="format-bar"><span className="format-mark">T</span><span className="format-divider"/><span className="format-help">Write freely, or use Markdown for headings and lists.</span></div><textarea className="body-input" value={active.body} onChange={(e) => update({ body: e.target.value })} placeholder={active.kind === "journal" ? "What’s on your mind today?\n\nStart anywhere…" : active.kind === "knowledge" ? "Add a thought, an idea, or something you want to remember…" : "Write something worth remembering…"} aria-label="Note body" spellCheck/></>}
              <div className="editor-bottom"><span>Created {new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(active.createdAt))}</span><button onClick={exportPDF}>Export / print <Icon name="share" size={14}/></button></div>
            </article>
          </> : <div className="editor-empty"><div className="empty-paper"><div className="paper-spark">✳</div><div className="paper-lines"><i/><i/><i/><i/><i/></div></div><h2>Your thoughts have room here.</h2><p>Select a note to continue, or start with a fresh page.</p><button className="empty-cta" onClick={() => create("quick")}><Icon name="plus" size={16}/>Create a new note</button></div>}
        </section>
      </div>
    </section>
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}

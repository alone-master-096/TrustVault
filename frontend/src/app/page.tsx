"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type User = { id: string; name: string; email: string; role: string; is_active?: boolean };
type AuditEntry = { id: string; action: string; success?: boolean; created_at?: string; user_name?: string; user_email?: string; document_id?: string | null; details?: unknown };
type Doc = {
  id: string; name: string; description?: string | null; category?: string | null;
  original_filename: string; mime_type: string; file_size: number;
  access_permission: string; is_owner: boolean; created_at?: string; updated_at?: string;
};
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const KEY = "trustvault_token";

function size(n: number) {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
function kind(d: Doc) {
  const ext = (d.original_filename || d.name).split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "PDF";
  if (["doc", "docx"].includes(ext)) return "DOC";
  if (["xls", "xlsx", "csv"].includes(ext)) return "XLS";
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "IMG";
  return "FILE";
}
function glyph(name: string) {
  const icons: Record<string, string> = {
    Dashboard: "⌂", "My Documents": "▤", "Shared With Me": "♧",
    "Recent Activity": "◷", Users: "♙", Permissions: "♧",
    "Audit Logs": "▦", Settings: "⚙"
  };
  return icons[name] || "•";
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerMode, setRegisterMode] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [view, setView] = useState<"grid" | "list">("list");
  const [showUpload, setShowUpload] = useState(false);
  const [showShare, setShowShare] = useState<Doc | null>(null);
  const [footerInfo, setFooterInfo] = useState<string | null>(null);
  const [preview, setPreview] = useState<Doc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filename, setFilename] = useState("");
  const [description, setDescription] = useState("");
  const [docCategory, setDocCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipients, setRecipients] = useState<User[]>([]);
  const [recipient, setRecipient] = useState("");
  const [permission, setPermission] = useState<"read" | "edit">("read");
  const [sharing, setSharing] = useState(false);
  const [shareMode, setShareMode] = useState<"grant" | "revoke">("grant");
  const [previewUrl, setPreviewUrl] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [compactCards, setCompactCards] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [defaultPermission, setDefaultPermission] = useState<"read" | "edit">("read");
  const [notifyShares, setNotifyShares] = useState(true);
  const [notifyPermissionChanges, setNotifyPermissionChanges] = useState(true);
  const [defaultSort, setDefaultSort] = useState("newest");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryUsers, setDirectoryUsers] = useState<User[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const signOut = useCallback(() => {
    sessionStorage.removeItem(KEY);
    setUser(null); setDocs([]); setPassword(""); setNotice(""); setError("");
  }, []);

  const loadDocs = useCallback(async (token: string) => {
    const r = await fetch(`${API}/api/documents/`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store"
    });
    if (r.status === 401) {
      signOut();
      throw new Error("Session expired. Please sign in again.");
    }
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || d.error || "Could not load documents.");
    setDocs(Array.isArray(d.documents) ? d.documents : []);
  }, [signOut]);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const token = sessionStorage.getItem(KEY);
      if (!token) { setRestoring(false); return; }
      try {
        const r = await fetch(`${API}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store"
        });
        if (!r.ok) { sessionStorage.removeItem(KEY); return; }
        const d = await r.json();
        if (!cancelled && d.user) {
          setUser(d.user);
          await loadDocs(token);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not restore session.");
      } finally {
        if (!cancelled) setRestoring(false);
      }
    }
    void restore();
    return () => { cancelled = true; };
  }, [loadDocs]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem("trustvault_sidebar_collapsed") === "true");
      setCompactCards(localStorage.getItem("trustvault_compact_cards") === "true");
      setMotionEnabled(localStorage.getItem("trustvault_motion") !== "false");
      const savedPermission = localStorage.getItem("trustvault_default_permission");
      if (savedPermission === "read" || savedPermission === "edit") setDefaultPermission(savedPermission);
      setNotifyShares(localStorage.getItem("trustvault_notify_shares") !== "false");
      setNotifyPermissionChanges(localStorage.getItem("trustvault_notify_permissions") !== "false");
      setDefaultSort(localStorage.getItem("trustvault_default_sort") || "newest");
    } catch {}
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    try {
      localStorage.setItem("trustvault_sidebar_collapsed", String(sidebarCollapsed));
      localStorage.setItem("trustvault_compact_cards", String(compactCards));
      localStorage.setItem("trustvault_motion", String(motionEnabled));
      localStorage.setItem("trustvault_default_permission", defaultPermission);
      localStorage.setItem("trustvault_notify_shares", String(notifyShares));
      localStorage.setItem("trustvault_notify_permissions", String(notifyPermissionChanges));
      localStorage.setItem("trustvault_default_sort", defaultSort);
    } catch {}
  }, [preferencesReady, sidebarCollapsed, compactCards, motionEnabled, defaultPermission, notifyShares, notifyPermissionChanges, defaultSort]);

  async function loadDirectoryUsers() {
    const token = sessionStorage.getItem(KEY);
    if (!token) { signOut(); return; }
    if (directoryQuery.trim().length < 2) {
      setError("Enter at least two characters to search workspace users.");
      return;
    }
    setDirectoryLoading(true);
    setError("");
    try {
      const r = await fetch(`${API}/api/users/search?q=${encodeURIComponent(directoryQuery.trim())}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store"
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { signOut(); throw new Error("Session expired. Sign in again."); }
      if (!r.ok) throw new Error(d.message || d.error || "Could not load workspace users.");
      setDirectoryUsers(Array.isArray(d.users) ? d.users : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workspace users.");
    } finally { setDirectoryLoading(false); }
  }

  const loadAuditLogs = useCallback(async () => {
    const token = sessionStorage.getItem(KEY);
    if (!token) { signOut(); return; }
    setAuditLoading(true);
    setError("");
    try {
      const r = await fetch(`${API}/api/admin/audit?limit=15`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store"
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { signOut(); throw new Error("Session expired. Sign in again."); }
      if (!r.ok) throw new Error(d.message || d.error || "Could not load audit logs.");
      setAuditLogs(Array.isArray(d.auditLogs) ? d.auditLogs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load audit logs.");
    } finally { setAuditLoading(false); }
  }, [signOut]);

  useEffect(() => {
    if (tab === "Audit Logs" && user && ["owner", "admin"].includes(user.role.toLowerCase())) void loadAuditLogs();
  }, [tab, user, loadAuditLogs]);

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setLoginLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(r.status === 401 ? "Incorrect email or password." : d.message || d.error || "Sign in failed.");
      if (!d.token || !d.user) throw new Error("Unexpected sign-in response.");
      sessionStorage.setItem(KEY, d.token);
      setUser(d.user); setPassword("");
      await loadDocs(d.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in.");
    } finally { setLoginLoading(false); setRestoring(false); }
  }

  async function registerAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    setRegisterLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: registerName.trim(),
          email: email.trim(),
          password
        })
      });

      const d = await r.json().catch(() => ({}));

      if (!r.ok) {
        const message =
          d.message ||
          (d.error === "EMAIL_ALREADY_EXISTS"
            ? "An account with this email already exists. Please sign in."
            : d.error === "VALIDATION_ERROR"
              ? "Please check your name, email, and password requirements."
              : "Account creation failed.");
        throw new Error(message);
      }

      setRegisterMode(false);
      setPassword("");
      setNotice("Account created successfully. Sign in with your new credentials.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create account.");
    } finally {
      setRegisterLoading(false);
    }
  }
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setNotice("");
    const token = sessionStorage.getItem(KEY);
    if (!token || !file) { setError("Choose a file first."); return; }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file); body.append("name", filename.trim());
      if (description.trim()) body.append("description", description.trim());
      if (docCategory.trim()) body.append("category", docCategory.trim());
      const r = await fetch(`${API}/api/documents/upload`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body
      });
      const d = await r.json();
      if (r.status === 401) { signOut(); throw new Error("Session expired. Sign in again."); }
      if (!r.ok) throw new Error(d.message || d.error || "Upload failed.");
      await loadDocs(token);
      setShowUpload(false); setFilename(""); setDescription(""); setDocCategory(""); setFile(null);
      setNotice(d.message || "Document uploaded successfully.");
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { setUploading(false); }
  }

  async function download(doc: Doc, openPreview = false) {
    const token = sessionStorage.getItem(KEY);
    if (!token) { signOut(); return; }
    setError("");
    try {
      const r = await fetch(`${API}/api/documents/${encodeURIComponent(doc.id)}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (r.status === 401) { signOut(); throw new Error("Session expired. Sign in again."); }
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || d.error || "Document request failed.");
      }
      const blob = await r.blob();
      if (openPreview) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(blob));
        setPreview(doc);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = doc.original_filename || doc.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Document request failed."); }
  }

  async function deleteDocument(doc: Doc) {
    if (!window.confirm(`Delete "${doc.name}" from your vault? It will be removed from the library.`)) return;

    const token = sessionStorage.getItem(KEY);
    if (!token) {
      signOut();
      setError("Please sign in again.");
      return;
    }

    setError("");
    setNotice("");
    try {
      const r = await fetch(`${API}/api/documents/${encodeURIComponent(doc.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await r.json().catch(() => ({}));

      if (r.status === 401) {
        signOut();
        throw new Error("Session expired. Sign in again.");
      }
      if (!r.ok) throw new Error(d.message || d.error || "Could not delete document.");

      await loadDocs(token);
      if (preview?.id === doc.id) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl("");
        setPreview(null);
      }
      setNotice(`"${doc.name}" was removed from your vault.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete document.");
    }
  }

  async function searchRecipients() {
    const token = sessionStorage.getItem(KEY);
    if (!token || recipientQuery.trim().length < 2) {
      setError("Enter at least two characters to search for a user."); return;
    }
    setError("");
    try {
      const r = await fetch(`${API}/api/users/search?q=${encodeURIComponent(recipientQuery.trim())}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store"
      });
      const d = await r.json();
      if (r.status === 401) { signOut(); throw new Error("Session expired."); }
      if (!r.ok) throw new Error(d.message || d.error || "User search failed.");
      setRecipients(Array.isArray(d.users) ? d.users : []);
      setRecipient("");
      if (!d.users?.length) setError("No active users matched that search.");
    } catch (e) { setError(e instanceof Error ? e.message : "User search failed."); }
  }

  async function submitShare() {
    const token = sessionStorage.getItem(KEY);
    if (!token || !showShare || !recipient) { setError("Search for and select a recipient first."); return; }
    setSharing(true); setError(""); setNotice("");
    try {
      const r = await fetch(`${API}/api/documents/${encodeURIComponent(showShare.id)}/permissions`, {
        method: shareMode === "grant" ? "POST" : "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(shareMode === "grant" ? { userId: recipient, permission } : { userId: recipient })
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { signOut(); throw new Error("Session expired."); }
      if (!r.ok) throw new Error(d.message || d.error || "Could not update access.");
      const target = recipients.find(x => x.id === recipient);
      setNotice(shareMode === "grant"
        ? `${permission.toUpperCase()} access granted to ${target?.name || "the selected user"}.`
        : `Access revoked for ${target?.name || "the selected user"}.`);
      setShowShare(null); setRecipients([]); setRecipientQuery(""); setRecipient("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update access."); }
    finally { setSharing(false); }
  }

  const categories = useMemo(() => ["All", ...Array.from(new Set(docs.map(d => d.category || "Uncategorized"))).sort()], [docs]);
  const filtered = useMemo(() => docs.filter(d => {
    const q = query.trim().toLowerCase();
    const match = !q || [d.name, d.original_filename, d.description || "", d.category || ""].some(v => v.toLowerCase().includes(q));
    const cat = category === "All" || (d.category || "Uncategorized") === category;
    const owner = tab !== "Shared With Me" || !d.is_owner;
    const mine = tab !== "My Documents" || d.is_owner;
    return match && cat && owner && mine;
  }).sort((a, b) => {
    if (defaultSort === "name") return a.name.localeCompare(b.name);
    if (defaultSort === "largest") return (Number(b.file_size) || 0) - (Number(a.file_size) || 0);
    const av = new Date(a.created_at || 0).getTime(), bv = new Date(b.created_at || 0).getTime();
    return defaultSort === "oldest" ? av - bv : bv - av;
  }), [docs, query, category, tab, defaultSort]);

  const totalBytes = docs.reduce((n, d) => n + (Number(d.file_size) || 0), 0);
  const sharedCount = docs.filter(d => !d.is_owner).length;
  const ownedCount = docs.filter(d => d.is_owner).length;

  if (restoring) return <main className="tv-loading"><div className="tv-brand-icon">T</div><p>Opening your secure vault…</p></main>;

  if (!user) return (
    <main className="tv-shell tv-login-screen">
      <section className="tv-brand-panel">
        <div className="tv-brand"><div className="tv-brand-icon">⬡</div><span>TrustVault</span></div>
        <div className="tv-brand-copy">
          <span className="tv-eyebrow">YOUR TRUSTED DIGITAL VAULT</span>
          <h1>Your documents.<br />Your control.</h1>
          <p>A secure space for managing your digital documents and the people who can access them.</p>
          <div className="tv-login-pills"><span>✦ Private by design</span><span>⌁ Access control</span></div>
        </div>
        <div className="tv-brand-footer"><span className="tv-status-dot" /> Built for privacy. Designed for trust.</div>
      </section>
      <section className="tv-form-panel"><div className="tv-form-wrap">
        <div className="tv-mobile-brand"><div className="tv-brand-icon">⬡</div><span>TrustVault</span></div>
        <span className="tv-eyebrow">{registerMode ? "CREATE YOUR ACCOUNT" : "WELCOME TO YOUR WORKSPACE"}</span><h2>{registerMode ? "Create your vault account" : "Sign in to your vault"}</h2>
        <p className="tv-muted">{registerMode ? "Create an account to receive documents shared with you." : "Your secure documents are just one step away."}</p>
        <form className="tv-form" onSubmit={registerMode ? registerAccount : login}>
          {registerMode && <>
            <label htmlFor="register-name">Full name</label>
            <input id="register-name" type="text" autoComplete="name" placeholder="Your full name" value={registerName} onChange={e => setRegisterName(e.target.value)} required maxLength={100} />
          </>}
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" autoComplete="username" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required maxLength={255} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete={registerMode ? "new-password" : "current-password"} placeholder={registerMode ? "At least 8 characters" : "Enter your password"} value={password} onChange={e => setPassword(e.target.value)} required minLength={registerMode ? 8 : 1} maxLength={100} />
          {error && <div className="tv-error" role="alert">{error}</div>}
          {notice && <div className="tv-security-note" role="status">{notice}</div>}
          <button className="tv-button" type="submit" disabled={loginLoading || registerLoading}>
            {registerMode ? (registerLoading ? "Creating account…" : "Create account") : (loginLoading ? "Signing in…" : "Sign in securely")} <span>→</span>
          </button>
          <button className="tv-button tv-button-ghost" type="button" disabled={loginLoading || registerLoading} onClick={() => { setRegisterMode(!registerMode); setError(""); setNotice(""); }}>
            {registerMode ? "Already have an account? Sign in" : "New to TrustVault? Create account"}
          </button>
        </form>
        <div className="tv-security-note">◆ Your vault is protected by authenticated access.</div>
      </div><footer className="tv-footer">TrustVault · Secure document management</footer></section>
    </main>
  );

  const nav = ["Dashboard", "My Documents", "Shared With Me", "Recent Activity", "Users", "Permissions", "Audit Logs", "Settings"];

  return (
    <main className={`tv-app ${sidebarCollapsed ? "tv-sidebar-collapsed" : ""} ${compactCards ? "tv-compact-cards" : ""} ${!motionEnabled ? "tv-reduce-motion" : ""}`}>
      <aside className="tv-sidebar" onMouseEnter={() => setSidebarCollapsed(false)} onMouseLeave={() => setSidebarCollapsed(true)}>
        <div className="tv-sidebar-brand-row"><button className="tv-brand tv-brand-button" onClick={() => setTab("Dashboard")}><span className="tv-brand-icon">⬡</span><span className="tv-brand-wordmark">TrustVault</span></button><button className="tv-sidebar-toggle" title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setSidebarCollapsed(v => !v)}>{sidebarCollapsed ? "☰" : "‹"}</button></div>
        <nav className="tv-nav" aria-label="Main navigation">
          {nav.map(item => <button key={item} title={sidebarCollapsed ? item : undefined} aria-label={item} className={`tv-nav-item ${tab === item ? "active" : ""}`} onClick={() => { setTab(item); setQuery(""); setCategory("All"); }}>
            <span className="tv-nav-glyph">{glyph(item)}</span><span className="tv-nav-label">{item}</span>{item === "Shared With Me" && sharedCount > 0 && <small>{sharedCount}</small>}
          </button>)}
        </nav>
        <div className="tv-sidebar-promo"><div className="tv-promo-shield">⬡</div><strong>Your files. Your control.</strong><p>TrustVault keeps your data safe, private and always yours.</p><div className="tv-promo-glow" /></div>
        <div className="tv-sidebar-bottom"><span className="tv-online-dot" /> Secure workspace <span className="tv-version">LOCAL</span></div>
      </aside>

      <section className="tv-main">
        <header className="tv-topbar">
          <label className="tv-global-search"><span>⌕</span><input aria-label="Search documents" placeholder="Search documents, filenames, categories…" value={query} onChange={e => { setQuery(e.target.value); if (tab === "Dashboard") setTab("My Documents"); }} /><kbd>⌘ K</kbd></label>
          <div className="tv-top-actions"><span className="tv-secure-label"><span className="tv-online-dot" /> Vault secured</span><div className="tv-profile"><div className="tv-avatar">{(user.name || "U").slice(0, 1).toUpperCase()}</div><div><strong>{user.name}</strong><span>{user.role || "User"}</span></div></div><button className="tv-signout" onClick={signOut}>Sign out ↗</button></div>
        </header>

        {error && <div className="tv-error tv-banner" role="alert"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
        {notice && <div className="tv-notice" role="status"><span>✓</span>{notice}<button onClick={() => setNotice("")}>×</button></div>}

        {tab === "Dashboard" && <>
          <section className="tv-hero">
            <div className="tv-hero-copy"><span className="tv-eyebrow">YOUR SECURE WORKSPACE</span><h1>Welcome back,<br />{user.name.split(" ")[0]}! <span className="tv-wave">✦</span></h1><p>Your secure vault is always ready. Manage your documents, control access and stay productive.</p><div className="tv-hero-actions"><button className="tv-button" onClick={() => setShowUpload(true)}>⇧ Upload document</button><button className="tv-button tv-button-ghost" onClick={() => setTab("My Documents")}>Explore documents ↗</button></div></div>
            <div className="tv-hero-art" aria-hidden="true"><div className="tv-art-orbit orbit-one" /><div className="tv-art-orbit orbit-two" /><div className="tv-art-mountain mountain-back" /><div className="tv-art-mountain mountain-front" /><div className="tv-art-shield">⬡<span>⌑</span></div><div className="tv-art-caption">SECURE <b>•</b> SHARE <b>•</b> COLLABORATE</div></div>
          </section>

          <section className="tv-stats-grid tv-stats-premium">
            <article className="tv-stat-card"><div className="tv-stat-top"><span className="tv-stat-icon blue">▤</span><span className="tv-stat-trend">LIVE</span></div><span>Total Documents</span><strong>{docs.length}</strong><small>Owned and shared with you</small><div className="tv-stat-line blue-line" /></article>
            <article className="tv-stat-card"><div className="tv-stat-top"><span className="tv-stat-icon pink">♧</span><span className="tv-stat-trend">ACCESS</span></div><span>Shared With Me</span><strong>{sharedCount}</strong><small>Documents shared by others</small><div className="tv-stat-line pink-line" /></article>
            <article className="tv-stat-card"><div className="tv-stat-top"><span className="tv-stat-icon cyan">♙</span><span className="tv-stat-trend">ACCOUNT</span></div><span>Your Role</span><strong className="tv-stat-role">{user.role || "User"}</strong><small>Authenticated workspace</small><div className="tv-stat-line cyan-line" /></article>
            <article className="tv-stat-card"><div className="tv-stat-top"><span className="tv-stat-icon gold">▤</span><span className="tv-stat-trend">TOTAL</span></div><span>Storage Listed</span><strong>{size(totalBytes)}</strong><small>Combined listed file size</small><div className="tv-stat-line gold-line" /></article>
          </section>

          <div className="tv-content-grid">
            <section className="tv-panel tv-recent-panel"><div className="tv-panel-heading"><div><span className="tv-eyebrow">YOUR LIBRARY</span><h2>Recent Documents</h2></div><button className="tv-text-link" onClick={() => setTab("My Documents")}>View all →</button></div>
              {docs.length === 0 ? <div className="tv-empty"><span className="tv-empty-icon">▤</span><h3>Your vault is ready</h3><p>Upload your first document to get started.</p><button className="tv-button" onClick={() => setShowUpload(true)}>Upload document</button></div> :
                <div className="tv-recent-table"><div className="tv-table-head"><span>Document</span><span>Type</span><span>Access</span><span>Size</span><span>Actions</span></div>
                  {docs.slice(0, 6).map((d, i) => <article className="tv-table-row" key={d.id} style={{ animationDelay: `${i * 45}ms` }}><button className={`tv-file-badge badge-${kind(d).toLowerCase()}`} onClick={() => void download(d, true)}>{kind(d)}</button><button className="tv-table-name" onClick={() => void download(d, true)}><strong>{d.name}</strong><span>{d.original_filename}</span></button><span className="tv-table-type">{kind(d)}</span><span className="tv-table-access">{d.is_owner ? "Owner" : d.access_permission}</span><span className="tv-table-size">{size(d.file_size)}</span><div className="tv-row-actions">{d.is_owner && <button title="Share document" onClick={() => { setShowShare(d); setRecipients([]); setRecipientQuery(""); }}>♧</button>}<button title="Download" onClick={() => void download(d)}>↓</button></div></article>)}
                </div>}
            </section>
            <aside className="tv-side-stack">
              <section className="tv-panel"><div className="tv-panel-heading"><div><span className="tv-eyebrow">SHORTCUTS</span><h2>Quick Actions</h2></div><span className="tv-panel-symbol">✧</span></div>
                <button className="tv-quick-action" onClick={() => setShowUpload(true)}><span className="quick-icon blue">⇧</span><span><strong>Upload document</strong><small>Add a file to your vault</small></span><b>→</b></button>
                <button className="tv-quick-action" onClick={() => setTab("My Documents")}><span className="quick-icon purple">▤</span><span><strong>Browse documents</strong><small>Search your library</small></span><b>→</b></button>
                <button className="tv-quick-action" onClick={() => { setTab("Shared With Me"); setQuery(""); }}><span className="quick-icon cyan">♧</span><span><strong>Shared with me</strong><small>{sharedCount} available documents</small></span><b>→</b></button>
                <button className="tv-quick-action" onClick={() => { const token = sessionStorage.getItem(KEY); if (token) void loadDocs(token).then(() => setNotice("Document library refreshed.")).catch(e => setError(e.message)); }}><span className="quick-icon gold">↻</span><span><strong>Refresh library</strong><small>Sync current document list</small></span><b>→</b></button>
              </section>
              <section className="tv-security-panel"><div className="tv-security-emblem">⬡</div><div><span className="tv-eyebrow">SECURITY FIRST</span><h3>Your vault. Your rules.</h3><p>Document access is checked by the server against your current permissions.</p></div><div className="tv-security-chips"><span>◈ Authenticated</span><span>⌁ Access control</span><span>◷ Protected routes</span></div><div className="tv-security-foot"><span className="tv-online-dot" /> Session status: active</div></section>
            </aside>
          </div>
        </>}

        {tab !== "Dashboard" && <>
          <section className="tv-page-heading"><span className="tv-eyebrow">TRUSTVAULT WORKSPACE</span><h1>{tab}</h1><p>{tab === "Shared With Me" ? "Documents other users have shared with your account." : tab === "My Documents" ? "Browse, filter, preview and manage your secure document library." : "Your secure document workspace and account controls."}</p></section>
          {(tab === "My Documents" || tab === "Shared With Me" || tab === "Recent Activity") ? <>
            <section className="tv-panel tv-library-panel"><div className="tv-panel-heading"><div><span className="tv-eyebrow">DOCUMENT LIBRARY</span><h2>{tab === "Shared With Me" ? "Shared documents" : tab === "Recent Activity" ? "Recently updated documents" : "All available documents"} <span className="tv-count">{filtered.length}</span></h2></div><button className="tv-button" onClick={() => setShowUpload(true)}>＋ Upload</button></div>
              <div className="tv-library-toolbar"><input className="tv-library-search" placeholder="Search documents…" value={query} onChange={e => setQuery(e.target.value)} /><select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter category">{categories.map(c => <option key={c}>{c}</option>)}</select><div className="tv-view-switch"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}>▦ Grid</button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>☷ List</button></div></div>
              {filtered.length === 0 ? <div className="tv-empty"><span className="tv-empty-icon">▤</span><h3>No matching documents</h3><p>Try another search or category, or upload a new document.</p><button className="tv-button" onClick={() => { setQuery(""); setCategory("All"); setShowUpload(true); }}>＋ Add document</button></div> :
                <div className={view === "grid" ? "tv-doc-grid" : "tv-doc-list"}>
                  {filtered.map(d => <article className="tv-library-doc" key={d.id}><button className={`tv-file-badge badge-${kind(d).toLowerCase()}`} onClick={() => void download(d, true)}>{kind(d)}</button><div className="tv-library-doc-info"><strong>{d.name}</strong><span>{d.original_filename}</span><div className="tv-doc-tags"><span>{d.category || "Uncategorized"}</span><span>{d.is_owner ? "Owner" : `${d.access_permission} access`}</span><span>{size(d.file_size)}</span></div></div><div className="tv-library-actions">{d.is_owner && <button onClick={() => { setShowShare(d); setRecipients([]); setRecipientQuery(""); }}>Share</button>} {d.is_owner && <button onClick={() => void deleteDocument(d)} style={{ color: "#b91c1c" }}>Delete</button>}<button onClick={() => void download(d, true)}>Preview</button><button onClick={() => void download(d)}>↓</button></div></article>)}
                </div>}
            </section>
          </> : tab === "Users" ? <section className="tv-panel tv-workflow-panel">
            <div className="tv-panel-heading"><div><span className="tv-eyebrow">WORKSPACE DIRECTORY</span><h2>Find workspace users</h2><p>Search existing accounts before sharing documents with them.</p></div><span className="tv-panel-symbol">♙</span></div>
            <form className="tv-directory-search" onSubmit={e => { e.preventDefault(); void loadDirectoryUsers(); }}><input aria-label="Search users" placeholder="Enter a name or email (2+ characters)" value={directoryQuery} onChange={e => setDirectoryQuery(e.target.value)} /><button className="tv-button" type="submit" disabled={directoryLoading}>{directoryLoading ? "Searching…" : "Search users →"}</button></form>
            {directoryUsers.length > 0 ? <div className="tv-directory-list">{directoryUsers.map(u => <article className="tv-directory-user" key={u.id}><div className="tv-avatar">{(u.name || "U").slice(0,1).toUpperCase()}</div><div className="tv-directory-user-main"><strong>{u.name}</strong><span>{u.email}</span></div><span className="tv-role-pill">{u.role || "User"}</span><button className="tv-text-link" onClick={() => { const owned = docs.find(d => d.is_owner); if (owned) { setShowShare(owned); setRecipients([u]); setRecipient(u.id); setRecipientQuery(`${u.name} ${u.email}`); setPermission(defaultPermission); setShareMode("grant"); } else { setError("Upload a document first, then share it with this user."); } }}>Share a file →</button></article>)}</div> : <div className="tv-empty"><span className="tv-empty-icon">♙</span><h3>Search for a user</h3><p>Enter at least two characters to find active accounts. User creation and role administration are not exposed by the current user-search endpoint.</p></div>}
          </section> : tab === "Permissions" ? <section className="tv-panel tv-workflow-panel">
            <div className="tv-panel-heading"><div><span className="tv-eyebrow">ACCESS CONTROL</span><h2>Document permissions</h2><p>Manage read/edit access using the existing secure sharing workflow.</p></div><span className="tv-panel-symbol">♧</span></div>
            {docs.filter(d => d.is_owner).length > 0 ? <div className="tv-permission-list">{docs.filter(d => d.is_owner).map(d => <article className="tv-permission-document" key={d.id}><span className={`tv-file-badge badge-${kind(d).toLowerCase()}`}>{kind(d)}</span><div className="tv-permission-document-main"><strong>{d.name}</strong><span>{d.original_filename} · {size(d.file_size)}</span><small>Current access: owner</small></div><button className="tv-button" onClick={() => { setShowShare(d); setRecipients([]); setRecipientQuery(""); setRecipient(""); setShareMode("grant"); }}>Manage access →</button></article>)}</div> : <div className="tv-empty"><span className="tv-empty-icon">♧</span><h3>No owned documents yet</h3><p>Upload a document to grant or revoke user access from here.</p><button className="tv-button" onClick={() => setShowUpload(true)}>＋ Upload document</button></div>}
            <div className="tv-permission-footnote">Permission changes are submitted to the existing backend endpoint and enforced by the server. Select “Manage access” to grant READ/EDIT or revoke access.</div>
          </section> : tab === "Audit Logs" ? <section className="tv-panel tv-workflow-panel">
            <div className="tv-panel-heading"><div><span className="tv-eyebrow">SECURITY HISTORY</span><h2>Audit logs</h2><p>Recent recorded activity associated with your account and owned documents.</p></div><button className="tv-button tv-button-ghost" onClick={() => void loadAuditLogs()} disabled={auditLoading}>{auditLoading ? "Refreshing…" : "↻ Refresh"}</button></div>
            {!["owner", "admin"].includes(user.role.toLowerCase()) ? <div className="tv-empty"><h3>Restricted section</h3><p>Your current role does not have permission to view audit logs.</p></div> : auditLogs.length === 0 ? <div className="tv-empty"><span className="tv-empty-icon">◷</span><h3>{auditLoading ? "Loading activity…" : "No audit events found"}</h3><p>Recorded sign-ins, document changes and permission updates will appear here when available.</p></div> : <div className="tv-audit-list">{auditLogs.map(log => <article className="tv-audit-row" key={log.id}><span className={`tv-audit-status ${log.success === false ? "failed" : ""}`}>{log.success === false ? "!" : "✓"}</span><div className="tv-audit-main"><strong>{(log.action || "activity").replace(/_/g, " ")}</strong><span>{log.user_name || log.user_email || "Workspace user"}{log.document_id ? ` · Document ${log.document_id}` : ""}</span>{log.details != null && <small>{typeof log.details === "string" ? log.details : JSON.stringify(log.details)}</small>}</div><time>{log.created_at ? new Date(log.created_at).toLocaleString() : "—"}</time></article>)}</div>}
          </section> : <section className="tv-settings-page">
            <div className="tv-settings-hero">
              <div><span className="tv-eyebrow">WORKSPACE CONTROL CENTER</span><h2>Settings</h2><p>Make TrustVault feel right for the way you work.</p></div>
              <div className="tv-settings-hero-icon">⚙</div>
            </div>
            <div className="tv-settings-profile tv-settings-profile-new">
              <div className="tv-avatar">{(user.name || "U").slice(0,1).toUpperCase()}</div>
              <div><strong>{user.name}</strong><span>{user.email}</span></div>
              <span className="tv-role-pill">{user.role}</span>
              <span className="tv-settings-saved"><i /> Preferences save automatically</span>
            </div>
            <div className="tv-settings-grid">
              <article className="tv-setting-card tv-setting-appearance">
                <div className="tv-setting-card-head"><span className="tv-setting-card-icon">◐</span><div><span className="tv-setting-kicker">LOOK & FEEL</span><h3>Appearance</h3><p>Shape your workspace experience.</p></div></div>
                <div className="tv-setting-card-body">
                  <div className="tv-setting-control"><div><strong>Compact document cards</strong><small>Fit more files on screen</small></div><button type="button" role="switch" aria-label="Compact document cards" aria-checked={compactCards} className={`tv-switch ${compactCards ? "on" : ""}`} onClick={() => setCompactCards(v => !v)}><span /></button></div>
                  <div className="tv-setting-control"><div><strong>Interface animations</strong><small>Enable subtle motion effects</small></div><button type="button" role="switch" aria-label="Interactive animations" aria-checked={motionEnabled} className={`tv-switch ${motionEnabled ? "on" : ""}`} onClick={() => setMotionEnabled(v => !v)}><span /></button></div>
                  <div className="tv-setting-control"><div><strong>Sidebar behavior</strong><small>Auto-expand on cursor hover</small></div><span className="tv-setting-status">AUTO HOVER</span></div>
                </div>
              </article>
              <article className="tv-setting-card tv-setting-documents">
                <div className="tv-setting-card-head"><span className="tv-setting-card-icon">▤</span><div><span className="tv-setting-kicker">FILE WORKFLOW</span><h3>Document Defaults</h3><p>Choose how files are shared and sorted.</p></div></div>
                <div className="tv-setting-card-body">
                  <label className="tv-setting-field"><span><strong>Default sharing access</strong><small>Used when opening Share</small></span><select className="tv-settings-select" aria-label="Default sharing permission" value={defaultPermission} onChange={e => { const v = e.target.value as "read" | "edit"; setDefaultPermission(v); setPermission(v); }}><option value="read">Read only</option><option value="edit">Can edit</option></select></label>
                  <label className="tv-setting-field"><span><strong>Library sorting</strong><small>Preferred document order</small></span><select className="tv-settings-select" aria-label="Default document sorting" value={defaultSort} onChange={e => setDefaultSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name (A–Z)</option><option value="largest">Largest first</option></select></label>
                  <div className="tv-setting-card-foot">Changes apply to your local preferences.</div>
                </div>
              </article>
              <article className="tv-setting-card tv-setting-notifications">
                <div className="tv-setting-card-head"><span className="tv-setting-card-icon">♧</span><div><span className="tv-setting-kicker">STAY INFORMED</span><h3>Notifications</h3><p>Choose which activity preferences are enabled.</p></div></div>
                <div className="tv-setting-card-body">
                  <div className="tv-setting-control"><div><strong>Document sharing</strong><small>Preference for sharing alerts</small></div><button type="button" role="switch" aria-label="Document sharing updates" aria-checked={notifyShares} className={`tv-switch ${notifyShares ? "on" : ""}`} onClick={() => setNotifyShares(v => !v)}><span /></button></div>
                  <div className="tv-setting-control"><div><strong>Permission changes</strong><small>Preference for access-change alerts</small></div><button type="button" role="switch" aria-label="Permission change updates" aria-checked={notifyPermissionChanges} className={`tv-switch ${notifyPermissionChanges ? "on" : ""}`} onClick={() => setNotifyPermissionChanges(v => !v)}><span /></button></div>
                  <div className="tv-setting-card-foot">These are saved preferences; email alerts require backend support.</div>
                </div>
              </article>
              <article className="tv-setting-card tv-setting-security">
                <div className="tv-setting-card-head"><span className="tv-setting-card-icon">⬡</span><div><span className="tv-setting-kicker">IDENTITY & ACCESS</span><h3>Account & Security</h3><p>Your signed-in identity and session.</p></div></div>
                <div className="tv-setting-card-body">
                  <div className="tv-security-identity"><div className="tv-avatar">{(user.name || "U").slice(0,1).toUpperCase()}</div><div><strong>{user.name}</strong><small>{user.email}</small></div><span className="tv-session-badge">● ACTIVE</span></div>
                  <div className="tv-setting-control"><div><strong>Account role</strong><small>Managed by your workspace</small></div><span className="tv-role-pill">{user.role}</span></div>
                  <button type="button" className="tv-button tv-button-ghost tv-settings-signout" onClick={signOut}>Sign out of TrustVault ↗</button>
                </div>
              </article>
            </div>
            <div className="tv-settings-bottom"><span>🔒 Your account and access rules remain protected by the server.</span><button className="tv-button tv-button-ghost" onClick={() => { setCompactCards(false); setMotionEnabled(true); setSidebarCollapsed(true); setDefaultPermission("read"); setPermission("read"); setNotifyShares(true); setNotifyPermissionChanges(true); setDefaultSort("newest"); }}>Reset preferences</button></div>
          </section>}
        </>}

        <footer className="tv-premium-footer" id="trustvault-footer">
          <div className="tv-footer-lightflow" aria-hidden="true">
            <span className="tv-footer-wave tv-footer-wave-one"></span><span className="tv-footer-wave tv-footer-wave-two"></span><span className="tv-footer-wave tv-footer-wave-three"></span><span className="tv-footer-glow"></span>
          </div>
          <div className="tv-premium-footer-inner">
            <div className="tv-footer-main">
              <div className="tv-footer-brand">
                <div className="tv-footer-brand-lockup"><span className="tv-footer-logo">⬡</span><span>TrustVault</span></div>
                <p>Your digital world, protected.</p><p className="tv-footer-brand-copy">Secure document management. Private by design. Your files stay under your control.</p>
                <div className="tv-footer-socials" aria-label="Official social links"><a href="https://www.linkedin.com/in/pernapati-sri-gopi-014b6a348/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" title="LinkedIn">in</a><a href="https://github.com/alone-master-096" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub">⌘</a><a href="mailto:pernapatsrigopi@gmail.com" aria-label="Email TrustVault" title="Email">✉</a></div>
              </div>
              <div className="tv-footer-column"><h3><span>◇</span> Product</h3>
                <button onClick={() => setTab("Dashboard")}>Dashboard <span>↗</span></button><button onClick={() => setTab("My Documents")}>Documents <span>↗</span></button><button onClick={() => setTab("Shared With Me")}>Shared with me <span>↗</span></button><button onClick={() => setTab("Recent Activity")}>Recent activity <span>↗</span></button><button onClick={() => setTab("Users")}>Users &amp; permissions <span>↗</span></button><button onClick={() => setTab("Audit Logs")}>Audit logs <span>↗</span></button>
              </div>
              <div className="tv-footer-column"><h3><span>▤</span> Resources</h3>
                <button onClick={() => setFooterInfo("Help Center")}>Help Center <span>↗</span></button><button onClick={() => setFooterInfo("FAQs")}>FAQs <span>↗</span></button><button onClick={() => setFooterInfo("Security")}>Security <span>↗</span></button><button onClick={() => setFooterInfo("Contact Support")}>Contact Support <span>↗</span></button>
              </div>
              <div className="tv-footer-column"><h3><span>⌂</span> Company</h3>
                <button onClick={() => setFooterInfo("About TrustVault")}>About TrustVault <span>↗</span></button><button onClick={() => setFooterInfo("Our Mission")}>Our Mission <span>↗</span></button><button onClick={() => setFooterInfo("Careers")}>Careers <span>↗</span></button><button onClick={() => setFooterInfo("Contact Us")}>Contact Us <span>↗</span></button>
              </div>
              <div className="tv-footer-column"><h3><span>⛨</span> Legal</h3>
                <button onClick={() => setFooterInfo("Privacy Policy")}>Privacy Policy <span>↗</span></button><button onClick={() => setFooterInfo("Terms of Service")}>Terms of Service <span>↗</span></button><button onClick={() => setFooterInfo("Cookie Policy")}>Cookie Policy <span>↗</span></button>
              </div>
              <div className="tv-footer-support"><div className="tv-footer-support-icon">✦</div><span className="tv-footer-support-eyebrow">HERE FOR YOU</span><h3>Need help?</h3><p>Find answers to common questions or learn how to get assistance with your vault.</p><button onClick={() => setFooterInfo("Contact Support")}>Contact Support <span>→</span></button><button className="tv-footer-faq-cta" onClick={() => setFooterInfo("FAQs")}>Browse FAQs <span>→</span></button><div className="tv-footer-support-status"><span></span> Your vault. Your control.</div></div>
            </div>
            <div className="tv-footer-security-strip"><span><span className="tv-footer-live-dot"></span> ACCESS CONTROLLED</span><span>Designed for safer document management</span><span>{docs.length} document{docs.length === 1 ? "" : "s"} in your workspace</span></div>
            <div className="tv-footer-bottom"><span>© {new Date().getFullYear()} TrustVault. All rights reserved.</span><span className="tv-footer-bottom-motto"><span>⬡</span> Built for a safer digital tomorrow.</span></div>
          </div>
        </footer>
        {footerInfo && <div className="tv-modal-backdrop tv-footer-info-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setFooterInfo(null); }}>
          <section className="tv-modal tv-footer-info-modal" role="dialog" aria-modal="true" aria-labelledby="tv-footer-info-title">
            <div className="tv-modal-head"><div><span className="tv-eyebrow">TRUSTVAULT RESOURCE</span><h2 id="tv-footer-info-title">{footerInfo}</h2></div><button className="tv-modal-close" onClick={() => setFooterInfo(null)} aria-label="Close">×</button></div>
            {footerInfo === "FAQs" ? <div className="tv-footer-faq-list">
              <details open><summary>How do I upload a document?</summary><p>Choose Upload document from the dashboard, select a supported file, add its details, and submit. The server validates uploads.</p></details>
              <details><summary>How do I share a document?</summary><p>Open a document's Share action, search for an active user, choose the access action and permission level, then confirm.</p></details>
              <details><summary>What is the difference between Read and Edit?</summary><p>Read is intended for viewing. Edit permits viewing and modifying where the document's permissions and server rules allow it.</p></details>
              <details><summary>Where can I review activity?</summary><p>Open Audit Logs or Recent Activity from the sidebar to review the activity available to your account.</p></details>
              <details><summary>How do I revoke access?</summary><p>Open Share for the relevant document, find the active user, select Revoke access, and submit the change.</p></details>
              <details><summary>Why can’t I access a document?</summary><p>Confirm you are signed in to the correct account and that the owner has granted access. If the problem remains, contact your TrustVault administrator.</p></details>
            </div> : <div className="tv-footer-info-copy">
              {footerInfo === "Help Center" && <><p>Welcome to the TrustVault Help Center. Use these quick steps to get started:</p><ul><li><b>Manage files:</b> use My Documents to browse, preview, download, or upload documents.</li><li><b>Control access:</b> use Share to grant or revoke access for an active user.</li><li><b>Review activity:</b> open Recent Activity or Audit Logs.</li><li><b>Account preferences:</b> open Settings to review available workspace options.</li></ul><p>For account-specific problems, contact your TrustVault administrator.</p></>}
              {footerInfo === "Security" && <><p>TrustVault is designed around controlled document access and workspace accountability.</p><ul><li>Access decisions are enforced by the server.</li><li>Document sharing is managed through explicit permissions.</li><li>Activity auditing helps workspace owners review available events.</li><li>Keep your sign-in credentials private and sign out on shared devices.</li></ul><p>This overview describes the app’s intended safeguards; it is not an independent security certification.</p></>}
              {footerInfo === "Privacy Policy" && <><p>TrustVault is intended to help you manage documents privately and control who can access them.</p><ul><li>Use sharing controls to decide which workspace users can access documents.</li><li>Workspace activity may be recorded for security and auditing.</li><li>Do not upload information you are not authorized to store.</li><li>Contact your workspace administrator to ask about data handling, retention, or deletion.</li></ul><p>This is an in-app overview, not a substitute for a reviewed legal privacy policy.</p></>}
              {footerInfo === "Terms of Service" && <><p>Use TrustVault only for lawful purposes and only with documents you are authorized to manage.</p><ul><li>Protect your account credentials.</li><li>Do not attempt to bypass permissions or access another user’s documents without authorization.</li><li>Use sharing and download features responsibly.</li><li>Report suspected unauthorized access to your workspace administrator.</li></ul><p>These introductory guidelines are not a formal legal agreement.</p></>}
              {footerInfo === "Cookie Policy" && <><p>This application may use browser storage or session mechanisms required to sign you in and keep the workspace functioning.</p><p>Do not assume optional analytics or advertising cookies are used. Ask your administrator for the deployed application’s full cookie inventory and retention details.</p></>}
              {footerInfo === "About TrustVault" && <><p>TrustVault is a secure document-sharing workspace built around a core promise: only people explicitly granted access should be able to reach a document, and workspace activity should be reviewable afterwards.</p><p>It is being developed in response to the Snovasys Fresher Hiring Challenge 2026, which emphasizes document-level authorization, permission revocation, and a meaningful audit trail.</p><p>Core capabilities include document upload and organization, named-user read/edit permissions, access revocation, activity logs, and administrative visibility.</p></>}
              {footerInfo === "Our Mission" && <><p>Our mission is to help teams share confidential documents without losing control over who can access them.</p><ul><li>Enforce authorization on the server, not only by hiding interface controls.</li><li>Make document permissions explicit and revocable.</li><li>Keep an audit trail of document and permission activity, including denied attempts where supported.</li><li>Prioritize security and accountability over unnecessary complexity.</li></ul><p>These goals reflect the TrustVault project brief; deployed security properties should be verified through tests and review.</p></>}
              {footerInfo === "Careers" && <><p>TrustVault is a project developed in the context of the Snovasys Fresher Hiring Challenge 2026. There is no separate careers programme or vacancy page configured at present.</p><p>For project-related enquiries, email <a href="mailto:pernapatsrigopi@gmail.com">pernapatsrigopi@gmail.com</a>.</p></>}
              {(footerInfo === "Contact Us" || footerInfo === "Contact Support") && <><p>For help with sign-in, document access, sharing, permissions, or workspace settings, email:</p><p><a href="mailto:pernapatsrigopi@gmail.com">pernapatsrigopi@gmail.com</a></p><p>Please do not include passwords, authentication tokens, or confidential document contents in support emails.</p></>}
            </div>}
            <div className="tv-modal-actions"><button className="tv-button" onClick={() => setFooterInfo(null)}>Close</button></div>
          </section>
        </div>}
      </section>

      {showUpload && <div className="tv-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowUpload(false); }}><section className="tv-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title"><div className="tv-modal-head"><div><span className="tv-eyebrow">ADD TO YOUR VAULT</span><h2 id="upload-title">Upload document</h2></div><button className="tv-modal-close" onClick={() => setShowUpload(false)} aria-label="Close">×</button></div><p className="tv-muted">Select a document and add details. Your existing server validation still applies.</p><form className="tv-modal-form" onSubmit={upload}><label htmlFor="up-name">Document name</label><input id="up-name" required maxLength={200} value={filename} onChange={e => setFilename(e.target.value)} placeholder="e.g. Insurance policy" /><label htmlFor="up-category">Category</label><input id="up-category" maxLength={100} value={docCategory} onChange={e => setDocCategory(e.target.value)} placeholder="Personal, Work, Finance…" /><label htmlFor="up-description">Description</label><textarea id="up-description" maxLength={1000} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details" /><label className="tv-dropzone"><span className="tv-drop-icon">⇧</span><strong>{file ? file.name : "Choose a file to upload"}</strong><span>{file ? size(file.size) : "Select a supported document from your computer"}</span><input type="file" required accept=".pdf,.txt,.png,.jpg,.jpeg,.docx" onChange={e => setFile(e.target.files?.[0] || null)} /></label>{error && <div className="tv-error">{error}</div>}<div className="tv-modal-actions"><button type="button" className="tv-button tv-button-ghost" onClick={() => setShowUpload(false)}>Cancel</button><button type="submit" className="tv-button" disabled={uploading}>{uploading ? "Uploading…" : "⇧ Upload securely"}</button></div></form></section></div>}

      {showShare && <div className="tv-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowShare(null); }}><section className="tv-modal" role="dialog" aria-modal="true" aria-labelledby="share-title"><div className="tv-modal-head"><div><span className="tv-eyebrow">DOCUMENT ACCESS</span><h2 id="share-title">Share document</h2></div><button className="tv-modal-close" onClick={() => setShowShare(null)} aria-label="Close">×</button></div><div className="tv-share-doc"><span className={`tv-file-badge badge-${kind(showShare).toLowerCase()}`}>{kind(showShare)}</span><div><strong>{showShare.name}</strong><span>{size(showShare.file_size)} · {showShare.original_filename}</span></div></div><p className="tv-muted">Search for an existing active user, then grant or revoke their access.</p><div className="tv-recipient-search"><input placeholder="Search users by name or email…" value={recipientQuery} onChange={e => setRecipientQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void searchRecipients(); } }} /><button className="tv-button" onClick={() => void searchRecipients()}>Search</button></div>{recipients.length > 0 && <div className="tv-recipient-list">{recipients.map(u => <button key={u.id} className={`tv-recipient ${recipient === u.id ? "selected" : ""}`} onClick={() => setRecipient(u.id)}><span className="tv-avatar">{u.name.slice(0, 1).toUpperCase()}</span><span><strong>{u.name}</strong><small>{u.email} · {u.role}</small></span><span className="tv-radio-dot">{recipient === u.id ? "●" : "○"}</span></button>)}</div>}<div className="tv-permission-choice"><label htmlFor="share-mode">Action</label><select id="share-mode" value={shareMode} onChange={e => setShareMode(e.target.value as "grant" | "revoke")}><option value="grant">Grant access</option><option value="revoke">Revoke access</option></select>{shareMode === "grant" && <><label htmlFor="share-permission">Permission type</label><select id="share-permission" value={permission} onChange={e => setPermission(e.target.value as "read" | "edit")}><option value="read">Read — view only</option><option value="edit">Edit — view and modify</option></select></>}</div>{error && <div className="tv-error">{error}</div>}<div className="tv-modal-actions"><button className="tv-button tv-button-ghost" onClick={() => setShowShare(null)}>Cancel</button><button className="tv-button" disabled={sharing || !recipient} onClick={() => void submitShare()}>{sharing ? "Saving…" : shareMode === "grant" ? "Grant access →" : "Revoke access →"}</button></div></section></div>}

      {preview && <div className="tv-modal-backdrop tv-preview-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) { setPreview(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(""); } }}><section className="tv-preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title"><header className="tv-preview-header"><div><span className="tv-eyebrow">DOCUMENT PREVIEW</span><h2 id="preview-title">{preview.name}</h2></div><div><button className="tv-button tv-button-ghost" onClick={() => void download(preview)}>↓ Download</button><button className="tv-modal-close" onClick={() => { setPreview(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(""); }}>×</button></div></header>{previewUrl && (preview.mime_type === "application/pdf" || /\.(pdf)$/i.test(preview.original_filename) ? <iframe className="tv-preview-frame" src={previewUrl} title={`Preview of ${preview.name}`} /> : preview.mime_type?.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(preview.original_filename) ? <div className="tv-image-preview"><img src={previewUrl} alt={preview.name} /></div> : <div className="tv-empty"><span className="tv-empty-icon">▤</span><h3>Preview is not available for this file type</h3><p>Download the file to open it with a compatible application.</p><button className="tv-button" onClick={() => void download(preview)}>↓ Download document</button></div>)}</section></div>}
    </main>
  );
}

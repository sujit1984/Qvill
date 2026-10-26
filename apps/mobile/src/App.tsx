import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from "expo-sqlite";
import { createNote, type Note, type NoteKind } from "@qvill/shared";

const initDb = async (db: SQLiteDatabase) => {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, parentId TEXT, tags TEXT NOT NULL DEFAULT '[]', pinned INTEGER NOT NULL DEFAULT 0, entryDate TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);`);
};

function Workspace() {
  const db = useSQLiteContext();
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [section, setSection] = useState<NoteKind | "all">("all");
  const [ready, setReady] = useState(false);
  const active = notes.find((n) => n.id === activeId) ?? null;
  const refresh = useCallback(async () => {
    const rows = await db.getAllAsync<any>("SELECT * FROM notes ORDER BY updatedAt DESC");
    setNotes(rows.map((row: any) => ({ ...row, tags: JSON.parse(row.tags ?? "[]"), pinned: !!row.pinned })) as Note[]);
    setReady(true);
  }, [db]);
  useEffect(() => { void refresh(); }, [refresh]);
  const persist = useCallback(async (note: Note) => {
    await db.runAsync(`INSERT INTO notes (id,kind,title,body,parentId,tags,pinned,entryDate,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,parentId=excluded.parentId,tags=excluded.tags,pinned=excluded.pinned,updatedAt=excluded.updatedAt`,
      note.id,note.kind,note.title,note.body,note.parentId,JSON.stringify(note.tags),note.pinned ? 1 : 0,note.entryDate ?? null,note.createdAt,note.updatedAt);
    await refresh();
  }, [db, refresh]);
  const add = (kind: NoteKind) => { const note = createNote(kind); void persist(note); setActiveId(note.id); setSection(kind); };
  const update = (changes: Partial<Note>) => { if (active) void persist({ ...active, ...changes, updatedAt: new Date().toISOString() }); };
  const visible = useMemo(() => notes.filter((n) => section === "all" || n.kind === section), [notes, section]);
  const nav = (kind: NoteKind | "all", label: string) => <Pressable key={kind} onPress={() => { setSection(kind); setActiveId(null); }} style={[styles.tab, section === kind && styles.tabActive]}><Text style={[styles.tabText, section === kind && styles.tabTextActive]}>{label}</Text></Pressable>;

  if (!ready) return <View style={styles.loading}><ActivityIndicator color="#3d76c6"/></View>;
  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><View style={styles.header}><View style={styles.brandRow}><View style={styles.logo}><Text style={styles.logoText}>Q</Text></View><View><Text style={styles.brand}>Qvill</Text><Text style={styles.tagline}>your space to think</Text></View><View style={{ flex: 1 }}/><Pressable style={styles.add} onPress={() => add(section === "journal" || section === "knowledge" ? section : "quick")}><Text style={styles.addText}>＋</Text></Pressable></View><View style={styles.tabs}>{nav("all","All")}{nav("journal","Journal")}{nav("knowledge","Pages")}{nav("pdf","PDFs")}</View></View>
  {active ? <View style={styles.editor}><Pressable onPress={() => setActiveId(null)}><Text style={styles.back}>‹  All notes</Text></Pressable><Text style={styles.kind}>{active.kind === "quick" ? "QUICK NOTE" : active.kind.toUpperCase()}</Text><TextInput value={active.title} onChangeText={(title) => update({ title })} placeholder="Untitled note" style={styles.title} multiline/><TextInput value={active.body} onChangeText={(body) => update({ body })} placeholder={active.kind === "journal" ? "What’s on your mind today?" : "Write something worth remembering…"} style={styles.body} multiline textAlignVertical="top"/><Text style={styles.saved}>Saved on this device</Text></View> : <FlatList data={visible} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} ListHeaderComponent={<View style={styles.listHeader}><Text style={styles.eyebrow}>{new Intl.DateTimeFormat("en",{weekday:"long",month:"long",day:"numeric"}).format(new Date())}</Text><Text style={styles.heading}>{section === "all" ? "Your notes" : section === "journal" ? "Your journal" : section === "knowledge" ? "Knowledge base" : "Your PDFs"}</Text><Text style={styles.subheading}>Capture a thought, then let it find its place.</Text></View>} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyMark}>✳</Text><Text style={styles.emptyTitle}>A little space to think.</Text><Text style={styles.emptyText}>Your notes are saved on this device as you write.</Text><Pressable style={styles.createButton} onPress={() => add(section === "journal" || section === "knowledge" ? section : "quick")}><Text style={styles.createText}>＋  Create a note</Text></Pressable></View>} renderItem={({ item }) => <Pressable onPress={() => setActiveId(item.id)} style={styles.note}><Text style={styles.kind}>{item.kind.toUpperCase()}</Text><Text style={styles.noteTitle}>{item.title || "Untitled note"}</Text><Text style={styles.noteBody} numberOfLines={2}>{item.body || "No text yet"}</Text><Text style={styles.noteTime}>{new Date(item.updatedAt).toLocaleDateString()}</Text></Pressable>}/>}
  </SafeAreaView>;
}

export default function App() {
  return <SQLiteProvider databaseName="qvill.db" onInit={initDb}><Workspace/></SQLiteProvider>;
}

const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:"#f7f9fc"},loading:{flex:1,alignItems:"center",justifyContent:"center",backgroundColor:"#f7f9fc"},header:{backgroundColor:"#fff",paddingHorizontal:20,paddingTop:12,borderBottomWidth:1,borderBottomColor:"#e8edf3"},brandRow:{flexDirection:"row",alignItems:"center",gap:10},logo:{width:39,height:39,borderRadius:12,backgroundColor:"#092859",alignItems:"center",justifyContent:"center"},logoText:{fontSize:27,color:"white",fontWeight:"500"},brand:{fontSize:17,fontWeight:"700",color:"#092859"},tagline:{fontSize:10,color:"#8291a4",marginTop:1},add:{width:36,height:36,borderRadius:10,backgroundColor:"#092859",alignItems:"center",justifyContent:"center"},addText:{fontSize:24,color:"white",lineHeight:27},tabs:{flexDirection:"row",gap:8,marginTop:19,marginBottom:12},tab:{borderRadius:20,paddingHorizontal:13,paddingVertical:7,backgroundColor:"#f3f6fa"},tabActive:{backgroundColor:"#eaf1fa"},tabText:{fontSize:11,color:"#718096"},tabTextActive:{fontWeight:"700",color:"#174678"},list:{paddingHorizontal:17,paddingBottom:28},listHeader:{paddingHorizontal:5,paddingTop:23,paddingBottom:16},eyebrow:{fontSize:11,fontWeight:"700",color:"#3d76c6"},heading:{fontSize:27,fontWeight:"700",color:"#153354",marginTop:8},subheading:{fontSize:12,color:"#8390a1",marginTop:5},note:{backgroundColor:"white",borderWidth:1,borderColor:"#e9edf2",borderRadius:12,padding:15,marginBottom:9},kind:{fontSize:9,fontWeight:"700",letterSpacing:1,color:"#6c829e"},noteTitle:{fontSize:16,fontWeight:"700",color:"#273950",marginTop:7},noteBody:{fontSize:12,color:"#8290a0",marginTop:5,lineHeight:18},noteTime:{fontSize:9,color:"#9aa6b3",marginTop:9},empty:{alignItems:"center",paddingTop:70},emptyMark:{width:48,height:48,textAlign:"center",textAlignVertical:"center",borderRadius:16,overflow:"hidden",backgroundColor:"#eaf1fa",color:"#5078a9",fontSize:23},emptyTitle:{fontSize:20,fontWeight:"700",color:"#1c3658",marginTop:14},emptyText:{fontSize:12,color:"#8895a4",marginTop:7,textAlign:"center"},createButton:{backgroundColor:"#092859",borderRadius:8,paddingHorizontal:14,paddingVertical:10,marginTop:18},createText:{fontSize:11,fontWeight:"700",color:"white"},editor:{flex:1,backgroundColor:"white",margin:12,borderWidth:1,borderColor:"#e9edf2",borderRadius:12,padding:19},back:{fontSize:12,color:"#5379a5",marginBottom:25},title:{fontSize:28,fontWeight:"700",color:"#183253",paddingVertical:13},body:{flex:1,fontSize:15,lineHeight:24,color:"#4b5d72",paddingTop:15},saved:{fontSize:10,color:"#66a287",borderTopWidth:1,borderTopColor:"#eff2f5",paddingTop:13,marginTop:12}});

import React, { useEffect, useMemo, useRef, useState } from "react";

const uid = () => Math.random().toString(36).slice(2, 10);

function useLocalStorage(key, initialValue) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : (typeof initialValue === "function" ? initialValue() : initialValue);
    } catch {
      return typeof initialValue === "function" ? initialValue() : initialValue;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
  }, [key, state]);
  return [state, setState];
}

const todayStr = () => new Date().toISOString().slice(0,10);

const REWARD_VALUES = { TASK_COMPLETE: 10, POMODORO_COMPLETE: 6, ROUTINE_STEP: 3, MOOD_ENTRY: 2, MED_ON_TIME: 5 };

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.16);
    o.onended = () => ctx.close();
  } catch {}
}

function useNoiseGenerator() {
  const ctxRef = useRef(null);
  const nodeRef = useRef(null);
  const typeRef = useRef("brown");
  const isOnRef = useRef(false);
  const [isOn, setIsOn] = useState(false);
  const [type, setType] = useState("brown");
  useEffect(()=>{ typeRef.current = type; },[type]);
  function start() {
    if (isOnRef.current) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;
    const bufferSize = 4096;
    const node = ctx.createScriptProcessor(bufferSize, 1, 1);
    let lastOut = 0.0;
    node.onaudioprocess = function(e) {
      const out = e.outputBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        const t = typeRef.current;
        if (t === "white") {
          out[i] = white * 0.2;
        } else if (t === "pink") {
          lastOut = 0.98 * lastOut + 0.02 * white;
          out[i] = (white + lastOut) * 0.2;
        } else {
          lastOut = (lastOut + (0.02 * white)) / 1.02;
          out[i] = lastOut * 3.5;
        }
      }
    };
    node.connect(ctx.destination);
    nodeRef.current = node;
    isOnRef.current = true;
    setIsOn(true);
  }
  function stop() {
    if (!isOnRef.current) return;
    nodeRef.current?.disconnect();
    ctxRef.current?.close();
    nodeRef.current = null;
    ctxRef.current = null;
    isOnRef.current = false;
    setIsOn(false);
  }
  return { isOn, type, setType, start, stop };
}

function usePomodoro() {
  const [settings, setSettings] = useLocalStorage("pomodoro_settings", { work: 25, shortBreak: 5, longBreak: 15, intervals: 4, autoStart: false, beep: true });
  const [state, setState] = useLocalStorage("pomodoro_state", { phase: "work", remaining: 25*60, running: false, cycle: 0, completedWorkSessions: 0 });
  const intervalRef = useRef(null);
  useEffect(() => {
    if (!state.running) return;
    intervalRef.current = setInterval(() => {
      setState(s => {
        const next = { ...s, remaining: s.remaining - 1 };
        if (next.remaining <= 0) {
          let phase = s.phase, cycle = s.cycle, completedWorkSessions = s.completedWorkSessions;
          if (s.phase === "work") {
            completedWorkSessions += 1;
            if ((completedWorkSessions % settings.intervals) === 0) { phase = "long"; next.remaining = settings.longBreak * 60; }
            else { phase = "short"; next.remaining = settings.shortBreak * 60; }
          } else { phase = "work"; next.remaining = settings.work * 60; cycle += 1; }
          if (settings.beep) playBeep();
          return { ...next, phase, cycle, completedWorkSessions, running: settings.autoStart };
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [state.running, settings, setState]);
  function start() { setState(s => ({ ...s, running: true })); }
  function pause() { setState(s => ({ ...s, running: false })); }
  function reset(toPhase = state.phase) {
    const mins = toPhase === "work" ? settings.work : toPhase === "short" ? settings.shortBreak : settings.longBreak;
    setState(s => ({ ...s, phase: toPhase, remaining: mins*60, running: false }));
  }
  const minutes = Math.floor(state.remaining / 60).toString().padStart(2, "0");
  const seconds = (state.remaining % 60).toString().padStart(2, "0");
  const total = (state.phase === "work" ? settings.work : state.phase === "short" ? settings.shortBreak : settings.longBreak) * 60;
  const progress = Math.min(1, Math.max(0, 1 - state.remaining / total));
  return { settings, setSettings, state, setState, start, pause, reset, minutes, seconds, progress, total };
}

const TABS = [
  { key: "focus", label: "Focus" },
  { key: "tasks", label: "Tasks" },
  { key: "routines", label: "Routines" },
  { key: "timers", label: "Timers" },
  { key: "mood", label: "Mood" },
  { key: "meds", label: "Meds" },
  { key: "lists", label: "Lists" },
  { key: "notes", label: "Notes" },
  { key: "rewards", label: "Rewards" },
  { key: "weekly", label: "Weekly Spread" },
  { key: "settings", label: "Settings" },
];

export default function App() {
  const [tab, setTab] = useLocalStorage("ui_tab", "focus");
  const [inbox, setInbox] = useLocalStorage("tasks", []);
  const [routines, setRoutines] = useLocalStorage("routines", []);
  const [notes, setNotes] = useLocalStorage("notes", "");
  const [lists, setLists] = useLocalStorage("lists", [ { id: uid(), name: "Groceries", items: [] } ]);
  const [moods, setMoods] = useLocalStorage("moods", []);
  const [meds, setMeds] = useLocalStorage("meds", []);
  const [xp, setXp] = useLocalStorage("xp", 0);
  const [pet, setPet] = useLocalStorage("pet", { name: "Momo", level: 1, xp: 0 });
  const [focusMode, setFocusMode] = useLocalStorage("focus_mode", false);
  const [focusTaskId, setFocusTaskId] = useLocalStorage("focus_task", null);
  const pom = usePomodoro();
  const noise = useNoiseGenerator();
  useEffect(() => {
    const levelThreshold = pet.level * 100;
    if (pet.xp >= levelThreshold) setPet(p => ({ ...p, level: p.level + 1, xp: p.xp - levelThreshold }));
  }, [pet, setPet]);
  function grantXP(amount) { setXp(x => x + amount); setPet(p => ({ ...p, xp: p.xp + amount })); }
  function addTask(title) { if (!title.trim()) return; const t = { id: uid(), title: title.trim(), project: "Inbox", due: "", estimateMins: 10, notes: "", done: false, subtasks: [] }; setInbox(prev => [t, ...prev]); }
  function toggleTask(id) {
    const t = inbox.find(x => x.id === id);
    const willBeDone = t ? !t.done : false;
    setInbox(prev => prev.map(tt => tt.id === id ? { ...tt, done: willBeDone } : tt));
    if (willBeDone) grantXP(REWARD_VALUES.TASK_COMPLETE);
  }
  function deleteTask(id) { setInbox(prev => prev.filter(t => t.id !== id)); }
  function biteSize(id, chunk = 10) {
    setInbox(prev => prev.map(t => t.id === id ? { ...t, subtasks: t.subtasks?.length ? t.subtasks : Array.from({ length: Math.max(1, Math.ceil((t.estimateMins||20)/chunk))}, (_,i)=>({ id: uid(), label: `${t.title} — ${i+1}`, done:false })) } : t));
  }
  function addRoutine() { setRoutines(r => [{ id: uid(), name: `Routine ${r.length+1}`, steps: [{ id: uid(), label: "Step 1", mins: 3 }], activeStep: 0 }, ...r]); }
  function markRoutineStep(rid, sid) { setRoutines(rs => rs.map(r => { if (r.id !== rid) return r; const idx = r.steps.findIndex(s => s.id === sid); const nextActive = Math.min(r.steps.length-1, r.activeStep + 1); grantXP(REWARD_VALUES.ROUTINE_STEP); return { ...r, activeStep: nextActive >= 0 ? nextActive : r.activeStep }; })); }
  function addMood(entry) { setMoods(m => { const filtered = m.filter(x => x.date !== entry.date); return [...filtered, entry]; }); grantXP(REWARD_VALUES.MOOD_ENTRY); }
  function addMed(m) { setMeds(prev => [{ id: uid(), name: m.name||"Medication", dose: m.dose||"", times: m.times||["08:00"], lastTaken: {}, ...m }, ...prev]); }
  function markMedTaken(mid) { const d = todayStr(); setMeds(old => old.map(m => { if (m.id !== mid) return m; const timeNow = new Date().toTimeString().slice(0,5); const last = { ...(m.lastTaken||{}) }; last[d] = Array.from(new Set([...(last[d]||[]), timeNow])); return { ...m, lastTaken: last }; })); grantXP(REWARD_VALUES.MED_ON_TIME); }
  useEffect(() => { if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") { try { Notification.requestPermission(); } catch {} } }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!(typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted")) return;
      const now = new Date();
      const hhmm = now.toTimeString().slice(0,5);
      const d = todayStr();
      meds.forEach(m => {
        if (m.times?.includes(hhmm)) {
          const already = m.lastTaken?.[d]?.some(t => t.slice(0,5) === hhmm);
          if (!already) { try { new Notification(`Medication: ${m.name}`, { body: `Time to take ${m.dose||"your dose"}` }); } catch {} }
        }
      });
    }, 30000);
    return () => clearInterval(timer);
  }, [meds]);
  const focusTask = React.useMemo(() => inbox.find(t => t.id === focusTaskId) || null, [inbox, focusTaskId]);
  return (
    <div className={`min-h-screen w-full bg-slate-950 text-slate-100 ${focusMode ? "overflow-hidden" : ""}`}>
      <header className="sticky top-0 z-20 border-b border-slate-800 backdrop-blur bg-slate-950/70">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="text-lg sm:text-xl font-semibold">ADHD Productivity Studio</div>
          <QuickCapture onAdd={addTask} />
          <div className="ml-auto flex items-center gap-2">
            <button onClick={()=>setFocusMode(v=>!v)} className={`px-3 py-1 rounded-xl border ${focusMode?"border-emerald-400 text-emerald-300":"border-slate-700 text-slate-300"}`}>{focusMode?"Exit Focus":"Focus Mode"}</button>
            <TabBar tab={tab} setTab={setTab} />
          </div>
        </div>
      </header>
      {focusMode && (
        <FocusOverlay
          pom={pom}
          task={focusTask}
          setFocusTaskId={setFocusTaskId}
          tasks={inbox}
          noise={noise}
        />
      )}
      {!focusMode && (
        <main className="max-w-7xl mx-auto px-4 py-6">
          {tab === "focus" && (
            <FocusDashboard
              pom={pom}
              noise={noise}
              tasks={inbox}
              setFocusTaskId={setFocusTaskId}
              setTab={setTab}
            />
          )}
          {tab === "tasks" && (
            <TasksPanel
              tasks={inbox}
              setTasks={setInbox}
              onBite={biteSize}
              onToggle={toggleTask}
              onDelete={deleteTask}
              setFocusTaskId={setFocusTaskId}
              setTab={setTab}
            />
          )}
          {tab === "routines" && (
            <RoutinesPanel routines={routines} setRoutines={setRoutines} onAdd={addRoutine} onStep={markRoutineStep} />
          )}
          {tab === "timers" && (
            <TimersPanel pom={pom} />
          )}
          {tab === "mood" && (
            <MoodPanel moods={moods} addMood={addMood} />
          )}
          {tab === "meds" && (
            <MedsPanel meds={meds} addMed={addMed} markMedTaken={markMedTaken} />
          )}
          {tab === "lists" && (
            <ListsPanel lists={lists} setLists={setLists} />
          )}
          {tab === "notes" && (
            <NotesPanel notes={notes} setNotes={setNotes} />
          )}
          {tab === "rewards" && (
            <RewardsPanel xp={xp} pet={pet} />
          )}
          {tab === "weekly" && (
            <WeeklySpread tasks={inbox} lists={lists} meds={meds} />
          )}
          {tab === "settings" && (
            <SettingsPanel pom={pom} noise={noise} />
          )}
        </main>
      )}
    </div>
  );
}

function TabBar({ tab, setTab }) {
  return (
    <nav className="hidden sm:flex flex-wrap gap-1">
      {TABS.map(t => (
        <button key={t.key} onClick={()=>setTab(t.key)} className={`px-3 py-1 rounded-xl border text-sm ${tab===t.key?"border-emerald-400 text-emerald-300":"border-slate-700 text-slate-300 hover:border-slate-600"}`}>{t.label}</button>
      ))}
    </nav>
  );
}

function QuickCapture({ onAdd }) {
  const [val, setVal] = useState("");
  return (
    <form onSubmit={(e)=>{e.preventDefault(); onAdd(val); setVal("");}} className="flex-1 flex items-center gap-2">
      <input value={val} onChange={e=>setVal(e.target.value)} placeholder="Quick capture… (enter to add)" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
      <button className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Add</button>
    </form>
  );
}

function FocusDashboard({ pom, noise, tasks, setFocusTaskId, setTab }) {
  const pending = tasks.filter(t => !t.done);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <Card title="Pomodoro Timer">
          <PomodoroUI pom={pom} compact={false} />
        </Card>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Pick a Focus Task">
            <div className="max-h-60 overflow-auto space-y-2">
              {pending.slice(0,15).map(t => (
                <div key={t.id} className="flex items-center justify-between bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2">
                  <div>
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs text-slate-400">{t.project} {t.due && `• due ${t.due}`}</div>
                  </div>
                  <button onClick={()=>{ setFocusTaskId(t.id); setTab("focus"); }} className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs">Focus</button>
                </div>
              ))}
              {pending.length===0 && <div className="text-sm text-slate-400">No open tasks. Add something via Quick Capture.</div>}
            </div>
          </Card>
          <Card title="Noise Generator">
            <div className="flex items-center gap-2">
              <select value={noise.type} onChange={e=>noise.setType(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-2 py-1">
                <option value="brown">Brown</option>
                <option value="pink">Pink</option>
                <option value="white">White</option>
              </select>
              {!noise.isOn ? (
                <button onClick={noise.start} className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Start</button>
              ) : (
                <button onClick={noise.stop} className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm">Stop</button>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">Use brown/pink/white noise to mask distractions. Headphones recommended.</p>
          </Card>
        </div>
      </div>
      <div className="lg:col-span-1 space-y-4">
        <Card title="Body Doubling">
          <BodyDoublingWidget />
        </Card>
        <Card title="Micro Wins">
          <div className="text-sm text-slate-300">Break tasks into <span className="font-semibold">bite-sized</span> chunks (≈10 minutes). Do one. Then *maybe* another.</div>
          <ul className="mt-2 text-xs text-slate-400 list-disc pl-5 space-y-1">
            <li>Set a 10–20m timer for a boring task.</li>
            <li>Reward yourself after each sprint (stretch, tea, song).</li>
            <li>Change location to switch context (desk → kitchen → library).</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function FocusOverlay({ pom, task, tasks, setFocusTaskId, noise }) {
  const [showPicker, setShowPicker] = useState(!task);
  useEffect(()=>{ setShowPicker(!task); },[task]);
  return (
    <div className="fixed inset-0 z-30 bg-slate-950/95 backdrop-blur-sm flex flex-col">
      <div className="max-w-5xl w-full mx-auto mt-10 px-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-semibold">Focus Mode</div>
          <div className="ml-auto flex items-center gap-2">
            <NoiseMini noise={noise} />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <Card title={task ? `Now focusing: ${task.title}` : "Pick a Task"}>
              {showPicker ? (
                <div className="space-y-2 max-h-[50vh] overflow-auto">
                  {tasks.filter(t=>!t.done).map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2">
                      <div>
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs text-slate-400">{t.project} {t.due && `• due ${t.due}`}</div>
                      </div>
                      <button onClick={()=>{ setFocusTaskId(t.id); }} className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs">Focus</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <PomodoroUI pom={pom} compact={false} />
                  <p className="text-sm text-slate-400">Tip: Put phone on Do Not Disturb. Close unrelated tabs. Fullscreen this window.</p>
                </div>
              )}
            </Card>
          </div>
          <div className="lg:col-span-1">
            <Card title="Controls">
              <div className="space-y-2">
                <button onClick={()=>setShowPicker(p=>!p)} className="w-full px-3 py-2 rounded-xl border border-slate-700 hover:border-slate-600">{showPicker?"Go to Timer":"Switch Task"}</button>
                <button onClick={()=>setFocusTaskId(null)} className="w-full px-3 py-2 rounded-xl border border-slate-700 hover:border-slate-600">Clear Focus Task</button>
              </div>
            </Card>
            <Card title="Noise">
              <div className="flex items-center gap-2">
                <select value={noise.type} onChange={e=>noise.setType(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-2 py-1">
                  <option value="brown">Brown</option>
                  <option value="pink">Pink</option>
                  <option value="white">White</option>
                </select>
                {!noise.isOn ? (
                  <button onClick={noise.start} className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Start</button>
                ) : (
                  <button onClick={noise.stop} className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm">Stop</button>
                )}
              </div>
            </Card>
            <Card title="Body Double">
              <BodyDoublingWidget compact />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function NoiseMini({ noise }){
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="opacity-70">Noise</span>
      <select value={noise.type} onChange={e=>noise.setType(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-md px-2 py-1">
        <option value="brown">Brown</option>
        <option value="pink">Pink</option>
        <option value="white">White</option>
      </select>
      {!noise.isOn ? (
        <button onClick={noise.start} className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white">Start</button>
      ) : (
        <button onClick={noise.stop} className="px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white">Stop</button>
      )}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
      {title && <h2 className="text-base font-semibold mb-3">{title}</h2>}
      {children}
    </section>
  );
}

function PomodoroUI({ pom }) {
  const { state, start, pause, reset, minutes, seconds, progress, settings } = pom;
  return (
    <div className="flex flex-col md:flex-row gap-6 items-center">
      <div className="relative w-48 h-48">
        <svg viewBox="0 0 100 100" className="w-48 h-48">
          <circle cx="50" cy="50" r="45" stroke="#1f2937" strokeWidth="8" fill="none" />
          <circle cx="50" cy="50" r="45" stroke="#34d399" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={Math.PI * 2 * 45} strokeDashoffset={(1 - progress) * Math.PI * 2 * 45} transform="rotate(-90 50 50)" />
          <text x="50" y="54" textAnchor="middle" className="fill-white text-xl font-semibold">{minutes}:{seconds}</text>
        </svg>
        <div className="absolute inset-0 flex items-end justify-center pb-2 text-xs text-slate-400">{state.phase.toUpperCase()}</div>
      </div>
      <div className="flex-1">
        <div className="flex flex-wrap gap-2 mb-2">
          {!state.running ? (
            <button onClick={start} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white">Start</button>
          ) : (
            <button onClick={pause} className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white">Pause</button>
          )}
          <button onClick={()=>reset("work")} className="px-3 py-2 rounded-xl border border-slate-700">Reset Work</button>
          <button onClick={()=>reset("short")} className="px-3 py-2 rounded-xl border border-slate-700">Reset Short</button>
          <button onClick={()=>reset("long")} className="px-3 py-2 rounded-xl border border-slate-700">Reset Long</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <LabeledInput label="Work (min)"><input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1" value={settings.work} onChange={e=>pom.setSettings(s=>({...s, work: +e.target.value || 1}))}/></LabeledInput>
          <LabeledInput label="Short (min)"><input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1" value={settings.shortBreak} onChange={e=>pom.setSettings(s=>({...s, shortBreak: +e.target.value || 1}))}/></LabeledInput>
          <LabeledInput label="Long (min)"><input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1" value={settings.longBreak} onChange={e=>pom.setSettings(s=>({...s, longBreak: +e.target.value || 1}))}/></LabeledInput>
          <LabeledInput label="Intervals"><input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1" value={settings.intervals} onChange={e=>pom.setSettings(s=>({...s, intervals: Math.max(1, +e.target.value || 1)}))}/></LabeledInput>
          <LabeledInput label="Auto start next"><input type="checkbox" checked={settings.autoStart} onChange={e=>pom.setSettings(s=>({...s, autoStart: e.target.checked}))}/></LabeledInput>
          <LabeledInput label="Beep on switch"><input type="checkbox" checked={settings.beep} onChange={e=>pom.setSettings(s=>({...s, beep: e.target.checked}))}/></LabeledInput>
        </div>
      </div>
    </div>
  );
}

function LabeledInput({ label, children }){
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-300">{label}{children}</label>
  );
}

function TasksPanel({ tasks, setTasks, onBite, onToggle, onDelete, setFocusTaskId, setTab }){
  const [filter, setFilter] = React.useState("all");
  const [title, setTitle] = React.useState("");
  const [project, setProject] = React.useState("Inbox");
  const [due, setDue] = React.useState("");
  const [estimate, setEstimate] = React.useState(20);
  const filtered = tasks.filter(t => { if (filter === "all") return true; if (filter === "today") return t.due === todayStr(); if (filter === "open") return !t.done; if (filter === "done") return t.done; return true; });
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1">
        <Card title="Add Task">
          <form onSubmit={(e)=>{e.preventDefault(); setTasks(prev => [{ id: uid(), title: title||"Untitled", project, due, estimateMins: estimate, notes: "", done:false, subtasks: [] }, ...prev]); setTitle(""); setDue(""); }} className="space-y-2">
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Task title" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2"/>
            <div className="grid grid-cols-2 gap-2">
              <input value={project} onChange={e=>setProject(e.target.value)} placeholder="Project" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2"/>
              <input type="date" value={due} onChange={e=>setDue(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2"/>
            </div>
            <label className="text-xs text-slate-400">Estimate minutes</label>
            <input type="number" value={estimate} onChange={e=>setEstimate(+e.target.value||10)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2"/>
            <button className="w-full px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white">Add</button>
          </form>
        </Card>
        <Card title="Filters">
          <div className="flex flex-wrap gap-2">
            {[["all","All"],["open","Open"],["today","Today"],["done","Done"]].map(([k,l])=> (
              <button key={k} onClick={()=>setFilter(k)} className={`px-3 py-1 rounded-xl border text-sm ${filter===k?"border-emerald-400 text-emerald-300":"border-slate-700"}`}>{l}</button>
            ))}
          </div>
        </Card>
        <Card title="Tips">
          <ul className="text-xs text-slate-400 list-disc pl-5 space-y-1">
            <li>Use <span className="text-slate-200">bite-size</span> to split a task into 10m chunks.</li>
            <li>Set a due date for *external deadlines*; avoid over-scheduling.</li>
            <li>Click a task’s <span className="text-slate-200">Focus</span> to jump into Focus Mode.</li>
          </ul>
        </Card>
      </div>
      <div className="lg:col-span-2">
        <Card title="Your Tasks">
          <div className="space-y-2 max-h-[65vh] overflow-auto">
            {filtered.map(t => (
              <div key={t.id} className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={t.done} onChange={()=>onToggle(t.id)} className="w-5 h-5"/>
                  <div className="flex-1">
                    <div className={`font-medium ${t.done?"line-through text-slate-500":""}`}>{t.title}</div>
                    <div className="text-xs text-slate-400">{t.project} {t.due && `• due ${t.due}`} • est {t.estimateMins||10}m</div>
                  </div>
                  <button onClick={()=>{onBite(t.id);}} className="px-2 py-1 rounded-lg border border-slate-700 text-xs">Bite-size</button>
                  <button onClick={()=>{ setFocusTaskId(t.id); setTab("focus"); }} className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs">Focus</button>
                  <button onClick={()=>onDelete(t.id)} className="px-2 py-1 rounded-lg border border-slate-700 text-xs">Delete</button>
                </div>
                {t.subtasks?.length>0 && (
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {t.subtasks.map(s => (
                      <div key={s.id} className="flex items-center gap-2 bg-slate-950/70 border border-slate-800 rounded-lg px-2 py-1">
                        <input type="checkbox" checked={s.done} onChange={()=>setTasks(prev => prev.map(tt => tt.id===t.id ? { ...tt, subtasks: tt.subtasks.map(ss => ss.id===s.id?{...ss, done:!ss.done}:ss) } : tt))} />
                        <div className={`text-xs ${s.done?"line-through text-slate-500":""}`}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {filtered.length===0 && <div className="text-sm text-slate-400">No tasks match the filter.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function RoutinesPanel({ routines, setRoutines, onAdd, onStep }){
  const [running, setRunning] = React.useState(null);
  const [remaining, setRemaining] = React.useState(0);
  const [stepIndex, setStepIndex] = React.useState(0);
  React.useEffect(() => {
    if (!running) return;
    const r = routines.find(x => x.id === running);
    if (!r) return;
    const startIdx = r.activeStep || 0;
    setStepIndex(startIdx);
    setRemaining((r.steps[startIdx]?.mins || 0) * 60);
  }, [running, routines]);
  React.useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          const r = routines.find(x => x.id === running);
          if (!r) return 0;
          if (stepIndex >= r.steps.length - 1) {
            playBeep();
            setRunning(null);
            return 0;
          } else {
            onStep(running, r.steps[stepIndex]?.id);
            setStepIndex(stepIndex + 1);
            return (r.steps[stepIndex + 1]?.mins || 0) * 60;
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running, stepIndex, routines, onStep]);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 space-y-4">
        <Card title="Create Routine">
          <button onClick={onAdd} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white">Add Routine</button>
          <p className="text-xs text-slate-400 mt-2">Use for mornings, shutdowns, cleaning, study blocks. Steps get their own timers.</p>
        </Card>
        <Card title="Tips">
          <ul className="text-xs text-slate-400 list-disc pl-5 space-y-1">
            <li>Keep steps short (3–10 min) to reduce overwhelm.</li>
            <li>Pin a routine to start your day on autopilot.</li>
            <li>Pair with noise & DND for fewer distractions.</li>
          </ul>
        </Card>
      </div>
      <div className="lg:col-span-2 space-y-4">
        {routines.map(r => (
          <Card key={r.id} title={r.name}>
            <div className="flex flex-wrap gap-2 mb-2">
              <button onClick={()=>setRunning(running===r.id?null:r.id)} className={`px-3 py-2 rounded-xl ${running===r.id?"bg-rose-600 hover:bg-rose-500":"bg-emerald-600 hover:bg-emerald-500"} text-white`}>{running===r.id?"Stop":"Run"}</button>
              <button onClick={()=>setRoutines(rs=>rs.map(x=>x.id===r.id?{...x, activeStep:0}:x))} className="px-3 py-2 rounded-xl border border-slate-700">Reset</button>
              <button onClick={()=>setRoutines(rs=>rs.filter(x=>x.id!==r.id))} className="px-3 py-2 rounded-xl border border-slate-700">Delete</button>
            </div>
            <div className="space-y-2">
              {r.steps.map((s, idx) => (
                <div key={s.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${idx===r.activeStep?"border-emerald-400 bg-emerald-400/10":"border-slate-800 bg-slate-900/70"}`}>
                  <div className="text-xs w-10">{s.mins}m</div>
                  <input className="flex-1 bg-transparent outline-none" value={s.label} onChange={e=>setRoutines(rs=>rs.map(rr=>rr.id===r.id?{...rr, steps: rr.steps.map(ss=>ss.id===s.id?{...ss, label:e.target.value}:ss)}:rr))}/>
                  <input type="number" className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm" value={s.mins} onChange={e=>setRoutines(rs=>rs.map(rr=>rr.id===r.id?{...rr, steps: rr.steps.map(ss=>ss.id===s.id?{...ss, mins: Math.max(1,+e.target.value||1)}:ss)}:rr))}/>
                  <button onClick={()=>setRoutines(rs=>rs.map(rr=>rr.id===r.id?{...rr, steps: rr.steps.filter(ss=>ss.id!==s.id)}:rr))} className="px-2 py-1 rounded-lg border border-slate-700 text-xs">Remove</button>
                </div>
              ))}
              <div>
                <button onClick={()=>setRoutines(rs=>rs.map(rr=>rr.id===r.id?{...rr, steps:[...rr.steps, { id: uid(), label: `Step ${rr.steps.length+1}`, mins: 5 }]}:rr))} className="px-3 py-1 rounded-lg border border-slate-700 text-xs">Add Step</button>
              </div>
            </div>
            {running===r.id && (
              <div className="mt-3 text-sm text-slate-300">Running: <span className="font-semibold">{r.steps[stepIndex]?.label}</span> — {Math.max(0, Math.floor(remaining/60))}:{(remaining%60).toString().padStart(2,'0')}</div>
            )}
          </Card>
        ))}
        {routines.length===0 && <div className="text-sm text-slate-400">No routines yet.</div>}
      </div>
    </div>
  );
}

function TimersPanel({ pom }){
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Pomodoro">
        <PomodoroUI pom={pom} />
      </Card>
      <Card title="10-Minute Sprint">
        <SprintTimer minutesDefault={10} />
      </Card>
    </div>
  );
}

function SprintTimer({ minutesDefault=10 }){
  const [running, setRunning] = React.useState(false);
  const [remaining, setRemaining] = React.useState(minutesDefault*60);
  const [minutes, setMinutes] = React.useState(minutesDefault);
  React.useEffect(()=>{ setRemaining(minutes*60); },[minutes]);
  React.useEffect(()=>{
    if (!running) return;
    const timer = setInterval(()=>{
      setRemaining(r=>{
        if (r<=1) { setRunning(false); playBeep(); return 0; }
        return r-1;
      });
    }, 1000);
    return ()=>clearInterval(timer);
  },[running]);
  const mm = Math.floor(remaining/60).toString().padStart(2,'0');
  const ss = (remaining%60).toString().padStart(2,'0');
  return (
    <div className="flex items-center gap-4">
      <div className="text-3xl font-semibold">{mm}:{ss}</div>
      {!running ? (
        <button onClick={()=>setRunning(true)} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white">Start</button>
      ) : (
        <button onClick={()=>setRunning(false)} className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white">Pause</button>
      )}
      <button onClick={()=>{setRunning(false); setRemaining(minutes*60);}} className="px-3 py-2 rounded-xl border border-slate-700">Reset</button>
      <div className="ml-auto flex items-center gap-2 text-sm">
        <span className="text-slate-400">Minutes</span>
        <input type="number" className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1" value={minutes} onChange={e=>setMinutes(Math.max(1, +e.target.value||1))}/>
      </div>
    </div>
  );
}

function MoodPanel({ moods, addMood }){
  const [mood, setMood] = React.useState(3);
  const [energy, setEnergy] = React.useState(3);
  const [focus, setFocus] = React.useState(3);
  const [note, setNote] = React.useState("");
  const today = todayStr();
  const existing = moods.find(m => m.date === today);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Log Today">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Scale label="Mood" value={mood} setValue={setMood} />
          <Scale label="Energy" value={energy} setValue={setEnergy} />
          <Scale label="Focus" value={focus} setValue={setFocus} />
          <div className="col-span-2 md:col-span-4">
            <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Notes" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2"/>
          </div>
        </div>
        <button onClick={()=>addMood({ date: today, mood, energy, focus, note })} className="mt-3 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white">Save</button>
        {existing && <div className="text-xs text-slate-400 mt-2">You already logged today. Saving will overwrite.</div>}
      </Card>
      <Card title="History (last 14 days)">
        <div className="grid grid-cols-1 gap-2 max-h-[60vh] overflow-auto">
          {moods.sort((a,b)=>a.date<b.date?1:-1).slice(0, 14).map(m=> (
            <div key={m.date} className="flex items-center gap-3 bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2">
              <div className="w-24 text-sm text-slate-300">{m.date}</div>
              <Pill label={`Mood ${m.mood}`} />
              <Pill label={`Energy ${m.energy}`} />
              <Pill label={`Focus ${m.focus}`} />
              {m.note && <div className="text-xs text-slate-400 truncate">{m.note}</div>}
            </div>
          ))}
          {moods.length===0 && <div className="text-sm text-slate-400">No entries yet.</div>}
        </div>
      </Card>
    </div>
  );
}

function Scale({ label, value, setValue }){
  return (
    <label className="text-sm">
      <div className="text-slate-300 mb-1">{label}: <span className="font-semibold">{value}</span></div>
      <input type="range" min={1} max={5} value={value} onChange={e=>setValue(+e.target.value)} className="w-full"/>
    </label>
  );
}

function Pill({ label }){
  return <span className="px-2 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs">{label}</span>;
}

function MedsPanel({ meds, addMed, markMedTaken }){
  const [name, setName] = React.useState("");
  const [dose, setDose] = React.useState("");
  const [times, setTimes] = React.useState("08:00,21:00");
  const today = todayStr();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div>
        <Card title="Add Medication">
          <div className="space-y-2">
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Name" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2"/>
            <input value={dose} onChange={e=>setDose(e.target.value)} placeholder="Dose (e.g., 20mg)" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2"/>
            <input value={times} onChange={e=>setTimes(e.target.value)} placeholder="Times (HH:MM, comma-separated)" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2"/>
            <button onClick={()=>{ addMed({ name, dose, times: times.split(",").map(s=>s.trim()).filter(Boolean) }); setName(""); setDose(""); setTimes("08:00,21:00"); }} className="w-full px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white">Add</button>
          </div>
        </Card>
      </div>
      <div className="lg:col-span-2">
        <Card title="Today">
          <div className="space-y-2">
            {meds.map(m => {
              const takenTimes = m.lastTaken?.[today] || [];
              return (
                <div key={m.id} className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="font-semibold">{m.name} <span className="text-xs text-slate-400">{m.dose}</span></div>
                      <div className="text-xs text-slate-400">Times: {m.times.join(", ")}</div>
                    </div>
                    <button onClick={()=>markMedTaken(m.id)} className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs">Mark Taken</button>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">Taken today: {takenTimes.length? takenTimes.join(", ") : "—"}</div>
                </div>
              );
            })}
            {meds.length===0 && <div className="text-sm text-slate-400">No medications added.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ListsPanel({ lists, setLists }){
  const [name, setName] = React.useState("");
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div>
        <Card title="New List">
          <div className="space-y-2">
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="List name" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2"/>
            <button onClick={()=>{ if(!name.trim()) return; setLists(prev=>[{ id: uid(), name: name.trim(), items: [] }, ...prev]); setName(""); }} className="w-full px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white">Add</button>
          </div>
        </Card>
      </div>
      <div className="lg:col-span-2 space-y-4">
        {lists.map(list => (
          <Card key={list.id} title={list.name}>
            <ListEditor list={list} setLists={setLists} />
          </Card>
        ))}
        {lists.length===0 && <div className="text-sm text-slate-400">No lists yet.</div>}
      </div>
    </div>
  );
}

function ListEditor({ list, setLists }){
  const [text, setText] = React.useState("");
  return (
    <div>
      <form onSubmit={(e)=>{e.preventDefault(); if(!text.trim()) return; setLists(prev=>prev.map(l=>l.id===list.id?{...l, items:[{ id: uid(), text: text.trim(), done:false }, ...l.items]}:l)); setText("");}} className="flex items-center gap-2">
        <input value={text} onChange={e=>setText(e.target.value)} placeholder="Add item" className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2"/>
        <button className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white">Add</button>
      </form>
      <div className="mt-2 space-y-2 max-h-64 overflow-auto">
        {list.items.map(it => (
          <div key={it.id} className="flex items-center gap-3 bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2">
            <input type="checkbox" checked={it.done} onChange={()=>setLists(prev=>prev.map(l=>l.id===list.id?{...l, items:l.items.map(ii=>ii.id===it.id?{...ii, done:!ii.done}:ii)}:l))}/>
            <div className={`flex-1 text-sm ${it.done?"line-through text-slate-500":""}`}>{it.text}</div>
            <button onClick={()=>setLists(prev=>prev.map(l=>l.id===list.id?{...l, items:l.items.filter(ii=>ii.id!==it.id)}:l))} className="px-2 py-1 rounded-lg border border-slate-700 text-xs">Del</button>
          </div>
        ))}
        {list.items.length===0 && <div className="text-sm text-slate-400">Empty list.</div>}
      </div>
    </div>
  );
}

function NotesPanel({ notes, setNotes }){
  return (
    <Card title="Brain Dump (Notes)">
      <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Dump thoughts here. Clear your head." className="w-full h-[60vh] bg-slate-900 border border-slate-700 rounded-2xl px-4 py-3"/>
      <p className="text-xs text-slate-400 mt-2">Tip: Use this to offload everything, then convert into tasks later.</p>
    </Card>
  );
}

function RewardsPanel({ xp, pet }){
  const levelThreshold = pet.level * 100;
  const pct = Math.min(1, pet.xp / levelThreshold);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Your Pet">
        <div className="flex items-center gap-4">
          <div className="text-6xl">{pet.level < 5 ? "🐣" : pet.level < 10 ? "🐥" : "🦉"}</div>
          <div>
            <div className="text-xl font-semibold">{pet.name} — L{pet.level}</div>
            <div className="h-3 w-56 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${pct*100}%` }} />
            </div>
            <div className="text-xs text-slate-400 mt-1">{Math.floor(pet.xp)}/{levelThreshold} XP</div>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">Earn XP by completing tasks, pomodoros, routine steps, mood logs, and marking meds on time.</p>
      </Card>
      <Card title="Lifetime XP">
        <div className="text-3xl font-semibold">{xp}</div>
      </Card>
    </div>
  );
}

function WeeklySpread({ tasks, lists, meds }){
  const start = startOfWeek(new Date());
  const days = Array.from({length:7}, (_,i)=> addDays(start, i));
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Weekly Spread</h2>
        <button onClick={()=>window.print()} className="px-3 py-2 rounded-xl border border-slate-700">Print</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-2">
        {days.map(d => {
          const dStr = d.toISOString().slice(0,10);
          const dayTasks = tasks.filter(t=>t.due===dStr && !t.done);
          return (
            <section key={dStr} className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3 min-h-[220px]">
              <div className="font-semibold mb-2">{d.toLocaleDateString(undefined, { weekday: 'short', month:'short', day:'numeric' })}</div>
              <ul className="space-y-1">
                {dayTasks.map(t => (
                  <li key={t.id} className="text-sm">□ {t.title}</li>
                ))}
                {dayTasks.length===0 && <li className="text-xs text-slate-500">No tasks due.</li>}
              </ul>
            </section>
          );
        })}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3">
          <div className="font-semibold mb-2">Groceries</div>
          <ul className="text-sm space-y-1">
            {(lists.find(l=>l.name.toLowerCase().includes("grocer"))?.items||[]).filter(x=>!x.done).slice(0,15).map(it => <li key={it.id}>□ {it.text}</li>)}
          </ul>
        </section>
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3">
          <div className="font-semibold mb-2">Medications</div>
          <ul className="text-sm space-y-1">
            {meds.slice(0,10).map(m => <li key={m.id}>• {m.name} {m.dose} — {m.times.join(", ")}</li>)}
            {meds.length===0 && <li className="text-xs text-slate-500">None</li>}
          </ul>
        </section>
      </div>
      <style>{`@media print{ body{ background:white } .print\:grid-cols-2{ grid-template-columns: repeat(2,minmax(0,1fr)); } }`}</style>
    </div>
  );
}

function startOfWeek(d){
  const day = d.getDay();
  const diff = (day===0? -6 : 1) - day;
  const nd = new Date(d); nd.setDate(d.getDate()+diff); nd.setHours(0,0,0,0); return nd;
}
function addDays(d, n){ const nd = new Date(d); nd.setDate(d.getDate()+n); return nd; }

function BodyDoublingWidget({ compact }){
  const [room, setRoom] = useLocalStorage("bd_room", "focus-"+uid());
  const url = `https://meet.jit.si/${room}`;
  return (
    <div className="text-sm">
      <div className="mb-2">Create a quick cowork room and share the link with a friend.</div>
      <div className="flex items-center gap-2">
        <input value={room} onChange={e=>setRoom(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2"/>
        <a href={url} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white">Open</a>
      </div>
      {!compact && <p className="text-xs text-slate-400 mt-2">Tip: Say your intention & timer out loud. Keep mic on low; video optional.</p>}
    </div>
  );
}

function SettingsPanel({ pom, noise }){
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Sound">
        <div className="flex items-center gap-2 text-sm">
          <span>Noise type</span>
          <select value={noise.type} onChange={e=>noise.setType(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
            <option value="brown">Brown</option>
            <option value="pink">Pink</option>
            <option value="white">White</option>
          </select>
          {!noise.isOn ? (
            <button onClick={noise.start} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white">Start</button>
          ) : (
            <button onClick={noise.stop} className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white">Stop</button>
          )}
        </div>
      </Card>
      <Card title="Pomodoro Defaults">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <LabeledInput label="Work (min)"><input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1" value={pom.settings.work} onChange={e=>pom.setSettings(s=>({...s, work:+e.target.value||1}))}/></LabeledInput>
          <LabeledInput label="Short (min)"><input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1" value={pom.settings.shortBreak} onChange={e=>pom.setSettings(s=>({...s, shortBreak:+e.target.value||1}))}/></LabeledInput>
          <LabeledInput label="Long (min)"><input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1" value={pom.settings.longBreak} onChange={e=>pom.setSettings(s=>({...s, longBreak:+e.target.value||1}))}/></LabeledInput>
          <LabeledInput label="Intervals"><input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1" value={pom.settings.intervals} onChange={e=>pom.setSettings(s=>({...s, intervals:Math.max(1,+e.target.value||1)}))}/></LabeledInput>
          <LabeledInput label="Auto start next"><input type="checkbox" checked={pom.settings.autoStart} onChange={e=>pom.setSettings(s=>({...s, autoStart:e.target.checked}))}/></LabeledInput>
          <LabeledInput label="Beep on switch"><input type="checkbox" checked={pom.settings.beep} onChange={e=>pom.setSettings(s=>({...s, beep:e.target.checked}))}/></LabeledInput>
        </div>
      </Card>
      <Card title="Tips & Philosophy">
        <ul className="text-xs text-slate-400 list-disc pl-5 space-y-1">
          <li>Design for <span className="text-slate-200">interest, novelty, urgency</span>. Keep sprints short.</li>
          <li>Externalize memory (calendar, lists). If it isn’t recorded, it doesn’t exist.</li>
          <li>Change context (room/library) to switch your brain’s mode.</li>
          <li>Be kind: systems will break. Restart with one small step.</li>
        </ul>
      </Card>
    </div>
  );
}

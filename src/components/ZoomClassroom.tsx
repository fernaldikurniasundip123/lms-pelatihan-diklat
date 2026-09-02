import { useState, useEffect, useRef } from "react";
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Send, 
  Users, 
  MessageSquare, 
  PhoneOff, 
  HelpCircle, 
  Activity,
  CheckCircle,
  Clock,
  Layout,
  User,
  Shield,
  Volume2
} from "lucide-react";
import Webcam from "react-webcam";
import { supabase } from "../lib/supabase";

interface ZoomClassroomProps {
  courseId: string;
  courseName: string;
  user: {
    id: string;
    name: string;
    identity: string;
    class_name?: string;
  };
  onLeave: () => void;
}

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  time: string;
  isSelf?: boolean;
}

interface SimulatedParticipant {
  id: string;
  name: string;
  isCameraOn: boolean;
  isMuted: boolean;
  avatar: string;
  role: "host" | "co-host" | "participant";
}

export default function ZoomClassroom({ courseId, courseName, user, onLeave }: ZoomClassroomProps) {
  // Local video/audio controls
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  
  // Chat Panel & Participants sidebar layout
  const [activeSidePanel, setActiveSidePanel] = useState<"none" | "chat" | "participants">("chat");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMsgText, setNewMsgText] = useState("");
  const [participants, setParticipants] = useState<SimulatedParticipant[]>([]);
  
  // Timing / Telemetry Tracking state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [cameraOnSeconds, setCameraOnSeconds] = useState(0);
  const [cameraOffSeconds, setCameraOffSeconds] = useState(0);
  const [micOnSeconds, setMicOnSeconds] = useState(0);
  
  // Session tracker refs
  const logIdRef = useRef<string>(crypto.randomUUID());
  const joinTimeRef = useRef<number>(Date.now());
  const webcamRef = useRef<Webcam>(null);
  
  // Audio indicator state
  const [audioLevel, setAudioLevel] = useState(0);

  // Load simulator classmates & initial messages
  useEffect(() => {
    // Standard classmates matching pelaut context
    const classmates: SimulatedParticipant[] = [
      { id: "p1", name: "Capt. Heri Setiawan (Instruktur)", isCameraOn: true, isMuted: false, avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=120", role: "host" },
      { id: "p2", name: "Rahmat Hidayat (Co-Host)", isCameraOn: true, isMuted: true, avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120", role: "co-host" },
      { id: "p3", name: "Siti Aminah, M.Mar.E", isCameraOn: false, isMuted: true, avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120", role: "participant" },
      { id: "p4", name: "Andri Wijaya", isCameraOn: true, isMuted: true, avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120", role: "participant" },
      { id: "p5", name: "Budi Santoso", isCameraOn: false, isMuted: true, avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120", role: "participant" },
    ];
    setParticipants(classmates);

    setChatMessages([
      { id: "m1", sender: "System", text: `Selamat datang di Pembelajaran Sinkronus Zoom Meeting untuk : ${courseName}`, time: "Sekarang" },
      { id: "m2", sender: "Capt. Heri Setiawan (Instruktur)", text: "Halo semuanya, selamat datang. Silakan aktifkan kamera Anda untuk memulai sesi pembelajaran sinkronus hari ini.", time: "1 Menit Lalu" },
      { id: "m3", sender: "Siti Aminah, M.Mar.E", text: "Selamat pagi Capt. Siap monitor.", time: "Beberapa Detik Lalu" },
    ]);
  }, [courseName]);

  // Periodic Telemetry Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
      
      // Update durations based on states
      if (isCameraOn) {
        setCameraOnSeconds(prev => prev + 1);
      } else {
        setCameraOffSeconds(prev => prev + 1);
      }
      
      if (!isMuted) {
        setMicOnSeconds(prev => prev + 1);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isCameraOn, isMuted]);

  // Periodic Database Sync every 5 seconds
  useEffect(() => {
    const syncInterval = setInterval(() => {
      syncTelemetryToDb();
    }, 5000);

    return () => {
      clearInterval(syncInterval);
      // Run final sync on unmount
      syncTelemetryToDb();
    };
  }, [elapsedSeconds, cameraOnSeconds, cameraOffSeconds, micOnSeconds]);

  // Simulated live audio volume level
  useEffect(() => {
    if (isMuted) {
      setAudioLevel(0);
      return;
    }
    const micTimer = setInterval(() => {
      // simulate speech peaks occasionally
      setAudioLevel(Math.floor(Math.random() * 80) + 10);
    }, 300);
    return () => clearInterval(micTimer);
  }, [isMuted]);

  // Simulated instructor / classmate activity
  useEffect(() => {
    const chatInterval = setInterval(() => {
      const messages = [
        "Materi hari ini sangat krusial untuk sertifikasi akhir ujian.",
        "Apakah ada pertanyaan untuk slide materi ini?",
        "Siap Capt, paham.",
        "Capt, ijin tanya mengenai prosedur darurat sekoci penolong.",
        "Pertanyaan bagus! Prosedur tersebut wajib mengacu pada regulasi SOLAS Bab III.",
      ];
      const senders = ["Capt. Heri Setiawan (Instruktur)", "Andri Wijaya", "Siti Aminah, M.Mar.E", "Budi Santoso"];
      const randomSender = senders[Math.floor(Math.random() * senders.length)];
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];
      
      setChatMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: randomSender,
          text: randomMsg,
          time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
        }
      ]);
    }, 28052); // post a message every 28 seconds

    return () => clearInterval(chatInterval);
  }, []);

  // Post dynamic upsert log (Supabase + LocalStorage Fallback)
  const syncTelemetryToDb = async () => {
    // Extract metadata
    const userClass = localStorage.getItem("selected_class") || user.class_name || "KELAS SINKRONUS";
    const totalDuration = Math.floor((Date.now() - joinTimeRef.current) / 1000);
    const nowIso = new Date().toISOString();
    
    const payload = {
      id: logIdRef.current,
      user_id: user.id,
      user_name: user.name,
      seafarer_code: user.identity,
      class_name: userClass,
      course_id: courseId,
      course_name: courseName,
      joined_at: new Date(joinTimeRef.current).toISOString(),
      left_at: nowIso,
      duration_seconds: totalDuration,
      camera_on_seconds: cameraOnSeconds,
      camera_off_seconds: cameraOffSeconds,
      mic_on_seconds: micOnSeconds,
      last_active: nowIso
    };

    try {
      // DB attempt
      const { error } = await supabase
        .from("zoom_logs")
        .upsert([payload], { onConflict: "id" });

      if (error) {
        // Fallback silently to localStorage
        saveToLocalFallback(payload);
      }
    } catch (e) {
      saveToLocalFallback(payload);
    }
  };

  const saveToLocalFallback = (payload: any) => {
    const stored = localStorage.getItem("local_zoom_logs") || "[]";
    let logsArray = JSON.parse(stored);
    
    // Find index or append
    const existingIndex = logsArray.findIndex((l: any) => l.id === payload.id);
    if (existingIndex > -1) {
      logsArray[existingIndex] = payload;
    } else {
      logsArray.push(payload);
    }
    
    localStorage.setItem("local_zoom_logs", JSON.stringify(logsArray));
  };

  // Convert seconds to readable HH:MM:SS
  const formatTime = (totalSecs: number) => {
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return [
      hours.toString().padStart(2, "0"),
      minutes.toString().padStart(2, "0"),
      secs.toString().padStart(2, "0")
    ].join(":");
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsgText.trim()) return;

    setChatMessages(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sender: user.name,
        text: newMsgText,
        time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        isSelf: true
      }
    ]);
    setNewMsgText("");
  };

  const handleExit = async () => {
    await syncTelemetryToDb();
    onLeave();
  };

  return (
    <div id="zoomWebSdkView" className="fixed inset-0 bg-[#121214] text-white flex flex-col font-sans z-50 overflow-hidden select-none">
      
      {/* Zoom Premium Control Header bar */}
      <div className="bg-[#1a1a1c] border-b border-gray-800 px-4 h-14 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="bg-red-600 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase animate-pulse">
            LIVE ONLINE
          </div>
          <div>
            <h1 className="font-extrabold text-sm md:text-base text-gray-100 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" /> Web Zoom Meeting SDK Client
            </h1>
            <p className="text-[10px] text-gray-400 font-mono">ID Sesi: {logIdRef.current.substring(0, 8)}... | {courseName}</p>
          </div>
        </div>

        {/* Dynamic Telemetry Status Panel */}
        <div className="hidden lg:flex items-center gap-6 bg-black/40 border border-gray-800 px-4 py-1.5 rounded-lg text-xs font-mono">
          <div className="flex items-center gap-1.5 text-blue-400">
            <Clock className="w-4 h-4" /> Durasi: <span className="font-bold text-gray-200">{formatTime(elapsedSeconds)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-green-400">
            <Video className="w-4 h-4" /> Cam ON: <span className="font-bold text-gray-200">{formatTime(cameraOnSeconds)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-red-400">
            <VideoOff className="w-4 h-4" /> Cam OFF: <span className="font-bold text-gray-200">{formatTime(cameraOffSeconds)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-yellow-400">
            <Mic className="w-4 h-4" /> Mic ON: <span className="font-bold text-gray-200">{formatTime(micOnSeconds)}</span>
          </div>
        </div>

        <div>
          <button 
            onClick={handleExit}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2"
          >
            <PhoneOff className="w-4 h-4" /> Akhiri Sesi
          </button>
        </div>
      </div>

      {/* Main Workspace: Screen grids / Split layout */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Left Side: Presentation Board + Participates grid */}
        <div className="flex-1 flex flex-col md:flex-row p-4 gap-4 overflow-y-auto">
          
          {/* Main Presenting screen */}
          <div className="flex-1 flex flex-col gap-3 min-w-[300px] bg-black/60 rounded-xl border border-gray-800 p-4 relative justify-center">
            {/* Top Indicator */}
            <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded-full text-xs font-semibold text-emerald-300 flex items-center gap-1.5 z-10">
              <Activity className="w-3.5 h-3.5 animate-spin" /> Sedang Berbagi Layar: Instruktur
            </div>

            {/* Simulated Live Presentation Screen Slide */}
            <div className="aspect-video w-full max-w-2xl mx-auto rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between overflow-hidden relative shadow-2xl">
              <div className="bg-gradient-to-r from-indigo-900 to-slate-950 p-4 text-center border-b border-white/10">
                <h3 className="text-sm md:text-base font-extrabold tracking-wide uppercase text-indigo-100">DIKLAT PEMBELAJARAN SINKRONUS</h3>
                <p className="text-[11px] text-gray-300 mt-1">Edisi Sertifikasi Kompetensi Pelaut &amp; Standar SOLAS-STCW</p>
              </div>

              <div className="p-6 md:p-8 flex-1 flex flex-col justify-center text-center">
                <div className="text-3xl md:text-4xl font-black text-indigo-400 tracking-tight">
                  {courseName}
                </div>
                <div className="mt-4 text-sm max-w-md mx-auto text-gray-300 leading-relaxed font-medium">
                  Modul Pembelajaran Sinkronus Tatap Muka Virtual via Web SDK. Tetap aktifkan kamera (ON) dan mikrofon Anda untuk tercatat di log kehadiran.
                </div>
              </div>

              <div className="bg-black/80 px-4 py-3 border-t border-white/5 flex justify-between items-center text-[10px] md:text-xs">
                <span className="text-indigo-400 font-bold">Slide 03 / 15: Prosedur &amp; Regulasi</span>
                <span className="text-gray-400 font-mono">Waktu Server: {new Date().toLocaleTimeString("id", { hour12: false })}</span>
              </div>
            </div>
          </div>

          {/* Right Side Grid: Participant viewports */}
          <div className="w-full md:w-80 flex flex-col gap-3 overflow-y-auto min-h-[160px]">
            {/* Self Video Viewport */}
            <div className="bg-black border border-gray-800 rounded-xl relative overflow-hidden aspect-video flex items-center justify-center">
              <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[10px] max-w-xs font-bold text-gray-100 truncate z-10 flex items-center gap-1.5">
                <User className="w-3" /> {user.name} (Anda)
              </div>
              <div className="absolute top-2 right-2 z-10">
                {!isMuted ? (
                  <div className="bg-emerald-500/90 text-white p-1 rounded-full text-[10px] flex items-center gap-1">
                    <Volume2 className="w-3.5 h-3.5" />
                    <span className="text-[9px] font-mono pr-1">{audioLevel}%</span>
                  </div>
                ) : (
                  <div className="bg-red-500/90 text-white p-1 rounded-full">
                    <MicOff className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>

              {isCameraOn ? (
                <div className="w-full h-full relative">
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    className="w-full h-full object-cover scale-x-[-1]"
                    videoConstraints={{ facingMode: "user" }}
                  />
                  {/* Visual mic/camera level banner overlay */}
                  <div className="absolute bottom-1 right-1 bg-black/60 text-[8px] font-mono px-1 rounded">
                    FST-60FPS
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 border border-zinc-800">
                  <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-lg font-bold">
                    {user.name.substring(0, 2).toUpperCase()}
                  </div>
                  <span className="text-xs text-gray-500 mt-2 font-medium">Kamera Anda Aktif Off</span>
                </div>
              )}
            </div>

            {/* Simulated classmates viewports */}
            {participants.map(p => (
              <div key={p.id} className="bg-black/80 border border-gray-800 rounded-xl relative overflow-hidden aspect-video flex flex-col items-center justify-center">
                <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[10px] font-bold text-gray-100 z-10 truncate">
                  {p.name} {p.role !== "participant" && `(${p.role})`}
                </div>
                <div className="absolute top-2 right-2 z-10">
                  {p.isMuted ? (
                    <div className="bg-red-500/90 text-white p-1 rounded-full">
                      <MicOff className="w-3 h-3" />
                    </div>
                  ) : (
                    <div className="bg-emerald-500 text-white p-1 rounded-full animate-bounce">
                      <Mic className="w-3 h-3" />
                    </div>
                  )}
                </div>

                {p.isCameraOn ? (
                  <div className="w-full h-full relative">
                    <img src={p.avatar} alt={p.name} className="w-full h-full object-cover border-none" />
                    <div className="absolute inset-0 bg-transparent" />
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900">
                    <div className="w-10 h-10 rounded-full bg-indigo-900 flex items-center justify-center text-sm font-bold">
                      {p.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-[10px] text-gray-500 mt-1">Video Off</span>
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>

        {/* Right Dock: Chat / Participants detail panels */}
        {activeSidePanel !== "none" && (
          <div className="w-full md:w-80 bg-[#1a1a1c] border-l border-gray-800 flex flex-col z-20">
            
            {/* Panel Tabs */}
            <div className="flex border-b border-gray-800 h-12 text-xs font-bold text-gray-400">
              <button 
                onClick={() => setActiveSidePanel("chat")}
                className={`flex-1 flex items-center justify-center gap-1.5 ${activeSidePanel === "chat" ? "border-b-2 border-blue-500 text-white bg-black/10" : ""}`}
              >
                <MessageSquare className="w-4 h-4" /> Live Chat ({chatMessages.length})
              </button>
              <button 
                onClick={() => setActiveSidePanel("participants")}
                className={`flex-1 flex items-center justify-center gap-1.5 ${activeSidePanel === "participants" ? "border-b-2 border-blue-500 text-white bg-black/10" : ""}`}
              >
                <Users className="w-4 h-4" /> Anggota ({participants.length + 1})
              </button>
            </div>

            {/* Panel Content: Live chat */}
            {activeSidePanel === "chat" && (
              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                <div className="flex-1 p-4 overflow-y-auto space-y-3.5 min-h-[250px] scrollbar-thin">
                  {chatMessages.map(m => (
                    <div key={m.id} className={`flex flex-col ${m.isSelf ? "items-end" : "items-start"}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-bold text-gray-400 truncate max-w-[120px]">{m.sender}</span>
                        <span className="text-[9px] text-gray-500">{m.time}</span>
                      </div>
                      <div className={`p-2.5 rounded-xl text-xs max-w-[85%] leading-relaxed ${
                        m.sender === "System" 
                          ? "bg-indigo-950/40 text-indigo-200 border border-indigo-900/40 w-full text-center" 
                          : m.isSelf 
                          ? "bg-blue-600 text-white" 
                          : "bg-zinc-800 text-gray-100"
                      }`}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Send chat */}
                <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-800 flex gap-2">
                  <input
                    type="text"
                    value={newMsgText}
                    onChange={(e) => setNewMsgText(e.target.value)}
                    placeholder="Ketik pesan..."
                    className="flex-1 bg-zinc-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                  <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg flex items-center justify-center transition">
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {/* Panel Content: Participant List */}
            {activeSidePanel === "participants" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                <div className="flex items-center justify-between p-2 rounded-lg bg-black/20 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                      {user.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-gray-100">{user.name} (Anda)</p>
                      <p className="text-[10px] text-gray-400 font-mono">{user.identity}</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-blue-900 text-blue-200 font-bold px-1.5 py-0.5 rounded">Me</span>
                </div>

                <div className="border-t border-gray-800 pt-3">
                  <p className="text-[11px] font-bold uppercase text-gray-500 tracking-wider mb-2">Anggota Lain ({participants.length})</p>
                  <div className="space-y-3">
                    {participants.map(p => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <img src={p.avatar} alt={p.name} className="w-7 h-7 rounded-full object-cover border-none" />
                          <div>
                            <p className="font-semibold text-gray-200">{p.name}</p>
                            <span className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">
                              {p.role}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          {p.isMuted ? <MicOff className="w-3.5 h-3.5 text-red-500" /> : <Mic className="w-3.5 h-3.5 text-emerald-500" />}
                          {p.isCameraOn ? <Video className="w-3.5 h-3.5 text-emerald-500" /> : <VideoOff className="w-3.5 h-3.5 text-red-500" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

      </div>

      {/* Embedded Web SDK Bottom control dock bar */}
      <div className="bg-[#1a1a1c] border-t border-gray-800 px-6 h-20 flex items-center justify-between z-10 gap-4 flex-wrap">
        
        {/* Toggle Devices buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold transition-all ${
              isMuted 
                ? "bg-red-600/20 hover:bg-red-600/30 text-red-500 border border-red-900/60" 
                : "bg-zinc-850 hover:bg-zinc-800 text-white border border-gray-800"
            }`}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-emerald-400" />}
            <span>{!isMuted ? "Muted" : "Unmute"}</span>
          </button>

          <button
            onClick={() => setIsCameraOn(!isCameraOn)}
            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold transition-all ${
              !isCameraOn 
                ? "bg-red-600/20 hover:bg-red-600/30 text-red-500 border border-red-900/60" 
                : "bg-zinc-850 hover:bg-zinc-800 text-white border border-gray-800"
            }`}
          >
            {isCameraOn ? <Video className="w-5 h-5 text-emerald-400" /> : <VideoOff className="w-5 h-5" />}
            <span>{isCameraOn ? "Stop Cam" : "Start Cam"}</span>
          </button>
        </div>

        {/* Center UI Layout info */}
        <div className="hidden md:flex items-center gap-2 text-xs bg-zinc-900/60 px-4 py-2 rounded-xl text-gray-300 border border-gray-800/40">
          <Activity className="w-4 h-4 text-blue-400" /> Layanan Web Zoom Online (WebRTC Enkripsi TLS 1.3 Aktif)
        </div>

        {/* Sidebar panels toggles */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveSidePanel(activeSidePanel === "chat" ? "none" : "chat")}
            className={`px-3 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeSidePanel === "chat" ? "bg-blue-600 text-white" : "bg-zinc-800 hover:bg-zinc-750 text-gray-300"
            }`}
          >
            <MessageSquare className="w-4 h-4" /> Obrolan ({chatMessages.length})
          </button>
          <button
            onClick={() => setActiveSidePanel(activeSidePanel === "participants" ? "none" : "participants")}
            className={`px-3 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeSidePanel === "participants" ? "bg-blue-600 text-white" : "bg-zinc-800 hover:bg-zinc-750 text-gray-300"
            }`}
          >
            <Users className="w-4 h-4" /> Anggota ({participants.length + 1})
          </button>
        </div>

      </div>

    </div>
  );
}

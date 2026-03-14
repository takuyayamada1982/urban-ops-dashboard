import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Bot,
  Compass,
  Edit3,
  MapPinned,
  Navigation,
  Plus,
  Route,
  Save,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";

const PURPOSE_LOCK = {
  productName: "Urban Ops Dashboard",
  lockedPurpose:
    "日常の行動予定を、現地点からどこへ向かっているかが即座に分かるSF軍隊シミュレーション風UIで可視化し、移動判断と行動整理を支援する。",
  lockedGoal:
    "スマホ上で、現在地・向いている方向・行動タスク・移動ルート・重要注意点・行動最適化提案を一体表示し、1日予定から複数日予定へ拡張できる構造を維持する。",
  lockedConstraints: [
    "目的とゴールはユーザーが明示的に変更するまで固定する",
    "無料利用を優先する",
    "地図は無料公開の情報源を使える構造にする",
    "GPSと方位情報が取れる場合はそれを表示に反映する",
    "SF的なHUDテイストを維持する",
  ],
};

const DAYS = {
  day1: "DAY 1 / 平日運用",
  day2: "DAY 2 / 外出タスク",
  day3: "DAY 3 / 予備日",
};

const STORAGE_KEY = "urban-ops-dashboard-tasks-v1";
const ALERT_LOG_STORAGE_KEY = "urban-ops-dashboard-alert-log-v1";

const INITIAL_TASKS = [
  {
    id: "t1",
    day: "day1",
    title: "自宅から片倉駅へ移動",
    status: "done",
    mode: "walk",
    startTime: "07:20",
    endTime: "07:32",
    fromLabel: "自宅",
    toLabel: "片倉駅",
    from: { lat: 35.6396, lng: 139.3418 },
    to: { lat: 35.6391, lng: 139.3364 },
    note: "持ち物確認と雨天時ルート切替あり",
    priority: 2,
    arrivalRadiusMeters: 120,
  },
  {
    id: "t2",
    day: "day1",
    title: "片倉駅から橋本駅へ移動",
    status: "doing",
    mode: "train",
    startTime: "07:32",
    endTime: "07:51",
    fromLabel: "片倉駅",
    toLabel: "橋本駅",
    from: { lat: 35.6391, lng: 139.3364 },
    to: { lat: 35.5947, lng: 139.3451 },
    note: "朝ピーク帯。ホーム混雑に注意",
    priority: 3,
    arrivalRadiusMeters: 180,
  },
  {
    id: "t3",
    day: "day1",
    title: "橋本駅から新宿駅へ移動",
    status: "todo",
    mode: "train",
    startTime: "07:51",
    endTime: "08:38",
    fromLabel: "橋本駅",
    toLabel: "新宿駅",
    from: { lat: 35.5947, lng: 139.3451 },
    to: { lat: 35.6909, lng: 139.7003 },
    note: "出口を誤ると移動ロスが出やすい",
    priority: 3,
    arrivalRadiusMeters: 180,
  },
  {
    id: "t4",
    day: "day1",
    title: "昼食ポイントへ移動",
    status: "todo",
    mode: "walk",
    startTime: "12:00",
    endTime: "12:10",
    fromLabel: "会議場所",
    toLabel: "昼食ポイント",
    from: { lat: 35.6895, lng: 139.7008 },
    to: { lat: 35.6916, lng: 139.7028 },
    note: "混雑前の入店推奨",
    priority: 1,
    arrivalRadiusMeters: 120,
  },
];

const MODE_META = {
  walk: { label: "徒歩", speedKmh: 4.8, color: "#67e8f9" },
  bike: { label: "自転車", speedKmh: 12, color: "#a7f3d0" },
  car: { label: "車", speedKmh: 30, color: "#fbbf24" },
  train: { label: "電車", speedKmh: 40, color: "#f0abfc" },
};

function toRadians(value) { return (value * Math.PI) / 180; }
function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function bearingDegrees(from, to) {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLng = toRadians(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}
function minutesBetween(startTime, endTime) {
  const [sh, sm] = startTime.split(":").map(Number); const [eh, em] = endTime.split(":").map(Number); return eh * 60 + em - (sh * 60 + sm);
}
function estimateIdealMinutes(task) { const meters = haversineMeters(task.from, task.to); const speed = MODE_META[task.mode].speedKmh; return Math.max(1, Math.round((meters / 1000 / speed) * 60)); }
function optimizeTasks(tasks) {
  const currentDay = tasks.filter((task) => task.day === "day1");
  const suggestions = [];
  currentDay.forEach((task, index) => {
    const planned = Math.max(1, minutesBetween(task.startTime, task.endTime));
    const ideal = estimateIdealMinutes(task);
    const gap = planned - ideal;
    if (gap >= 15) suggestions.push({ id: `slack-${task.id}`, level: "mid", title: `${task.title} に余白あり`, detail: `想定所要 ${ideal}分に対し、予定は ${planned}分です。前後の行動を前倒しできる余地があります。` });
    if (gap <= -5) suggestions.push({ id: `tight-${task.id}`, level: "high", title: `${task.title} がタイト`, detail: `想定所要 ${ideal}分に対し、予定は ${planned}分です。遅延吸収のため余裕時間を追加してください。` });
    const next = currentDay[index + 1];
    if (next && task.toLabel === next.fromLabel && task.mode !== next.mode) suggestions.push({ id: `handoff-${task.id}`, level: "low", title: `${task.toLabel} で移動モード切替`, detail: `同地点で ${MODE_META[task.mode].label} → ${MODE_META[next.mode].label} へ切替です。乗換や準備時間を明示すると安定します。` });
  });
  if (!suggestions.length) suggestions.push({ id: "stable-plan", level: "low", title: "現状の計画は安定", detail: "大きな時間衝突は見当たりません。現地混雑や遅延だけ監視すれば運用しやすい状態です。" });
  return suggestions;
}
function loadAlertLog() { if (typeof window === "undefined") return []; try { const raw = window.localStorage.getItem(ALERT_LOG_STORAGE_KEY); if (!raw) return []; const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function loadTasks() { if (typeof window === "undefined") return INITIAL_TASKS; try { const raw = window.localStorage.getItem(STORAGE_KEY); if (!raw) return INITIAL_TASKS; const parsed = JSON.parse(raw); return Array.isArray(parsed) && parsed.length ? parsed : INITIAL_TASKS; } catch { return INITIAL_TASKS; } }
function createTaskId() { return Math.random().toString(36).slice(2, 10); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function normalizePoint(point, bounds) {
  const lngRange = Math.max(bounds.maxLng - bounds.minLng, 0.0001);
  const latRange = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
  const x = 8 + ((point.lng - bounds.minLng) / lngRange) * 84;
  const y = 12 + (1 - (point.lat - bounds.minLat) / latRange) * 76;
  return { x: clamp(x, 6, 94), y: clamp(y, 8, 92) };
}
function buildMapBounds(tasks, currentLocation) { const points = tasks.flatMap((task) => [task.from, task.to]); if (currentLocation) points.push(currentLocation); const lats = points.map((p) => p.lat); const lngs = points.map((p) => p.lng); return { minLat: Math.min(...lats) - 0.01, maxLat: Math.max(...lats) + 0.01, minLng: Math.min(...lngs) - 0.01, maxLng: Math.max(...lngs) + 0.01 }; }
function buildTaskPlot(task, bounds) { return { from: normalizePoint(task.from, bounds), to: normalizePoint(task.to, bounds) }; }
function getDirectionArrowDegrees(heading, currentLocation, target) { if (currentLocation && target) return bearingDegrees(currentLocation, target); if (heading !== null) return heading; return null; }
function estimateRemainingMinutes(currentLocation, task) { if (!task) return null; const origin = currentLocation || task.from; const meters = haversineMeters(origin, task.to); const speed = MODE_META[task.mode].speedKmh; return Math.max(1, Math.round((meters / 1000 / speed) * 60)); }
function detectAutoStatuses(tasks, currentLocation, selectedDay) { return tasks; }
function scoreTaskForOrdering(task, previousTask) { const priorityWeight = (4 - (task.priority || 1)) * 100; const [hour, minute] = task.startTime.split(":").map(Number); const timeWeight = hour * 60 + minute; const hopDistance = previousTask ? haversineMeters(previousTask.to, task.from) : 0; const modePenalty = task.mode === "walk" ? 5 : task.mode === "bike" ? 10 : task.mode === "car" ? 15 : 20; return priorityWeight + timeWeight + hopDistance / 100 + modePenalty; }
function suggestOptimizedOrder(dayTasks) { const pool = [...dayTasks]; if (pool.length <= 1) return pool; const ordered = []; pool.sort((a, b) => scoreTaskForOrdering(a, null) - scoreTaskForOrdering(b, null)); ordered.push(pool.shift()); while (pool.length) { const previousTask = ordered[ordered.length - 1]; pool.sort((a, b) => scoreTaskForOrdering(a, previousTask) - scoreTaskForOrdering(b, previousTask)); ordered.push(pool.shift()); } return ordered.filter(Boolean); }
function applyOptimizedOrder(tasks) { return tasks; }
function buildAlerts() { return []; }
export default function CyberMissionDashboardMock() {
  const [tasks, setTasks] = useState(() => loadTasks());
  const [selectedDay, setSelectedDay] = useState("day1");
  const [selectedTaskId] = useState(INITIAL_TASKS[1].id);
  const [mobileTab, setMobileTab] = useState("map");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [heading, setHeading] = useState(null);
  const [gpsError, setGpsError] = useState("");
  const [orientationPermissionState, setOrientationPermissionState] = useState("unknown");
  const [orientationError, setOrientationError] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskFromLabel, setNewTaskFromLabel] = useState("");
  const [newTaskToLabel, setNewTaskToLabel] = useState("");
  const [newTaskStart, setNewTaskStart] = useState("09:00");
  const [newTaskEnd, setNewTaskEnd] = useState("09:30");
  const [newTaskMode, setNewTaskMode] = useState("walk");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editFromLabel, setEditFromLabel] = useState("");
  const [editToLabel, setEditToLabel] = useState("");
  const [editStart, setEditStart] = useState("09:00");
  const [editEnd, setEditEnd] = useState("09:30");
  const [editMode, setEditMode] = useState("walk");
  const [editArrivalRadius, setEditArrivalRadius] = useState(120);
  const [flightProgress, setFlightProgress] = useState(0);
  const [optimizedPreviewIds, setOptimizedPreviewIds] = useState([]);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState("default");
  const [dismissedAlertIds, setDismissedAlertIds] = useState([]);
  const [alertLog, setAlertLog] = useState(() => loadAlertLog());
  const sentBrowserNotificationIdsRef = useRef(new Set());
  const watchIdRef = useRef(null);
  const dayTasks = useMemo(() => tasks.filter((task) => task.day === selectedDay), [tasks, selectedDay]);
  const currentTask = useMemo(() => dayTasks[0] || null, [dayTasks]);
  const nextTask = useMemo(() => dayTasks[1] || null, [dayTasks]);
  const optimization = useMemo(() => optimizeTasks(tasks), [tasks]);
  const remainingDistanceMeters = useMemo(() => currentTask ? Math.round(haversineMeters(currentLocation || currentTask.from, currentTask.to)) : null, [currentLocation, currentTask]);
  const remainingMinutes = useMemo(() => estimateRemainingMinutes(currentLocation, currentTask), [currentLocation, currentTask]);
  const alerts = [];
  const mapBounds = useMemo(() => buildMapBounds(dayTasks.length ? dayTasks : INITIAL_TASKS, currentLocation), [dayTasks, currentLocation]);
  const plottedTasks = useMemo(() => dayTasks.map((task) => ({ task, plot: buildTaskPlot(task, mapBounds) })), [dayTasks, mapBounds]);
  const currentLocationPlot = useMemo(() => (currentLocation ? normalizePoint(currentLocation, mapBounds) : null), [currentLocation, mapBounds]);
  const routeHeading = useMemo(() => getDirectionArrowDegrees(heading, currentLocation, currentTask?.to || null), [heading, currentLocation, currentTask]);
  const activePlot = useMemo(() => (currentTask ? buildTaskPlot(currentTask, mapBounds) : null), [currentTask, mapBounds]);
  const movingPlotPoint = useMemo(() => activePlot ? ({ x: activePlot.from.x + (activePlot.to.x - activePlot.from.x) * flightProgress, y: activePlot.from.y + (activePlot.to.y - activePlot.from.y) * flightProgress }) : null, [activePlot, flightProgress]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) return;
    watchIdRef.current = navigator.geolocation.watchPosition((position) => { setCurrentLocation({ lat: position.coords.latitude, lng: position.coords.longitude }); setGpsError(""); }, (error) => setGpsError(error.message || "GPSの取得に失敗しました。"), { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 });
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);
  useEffect(() => { const timer = window.setInterval(() => setFlightProgress((prev) => prev > 1 ? 0 : prev + 0.025), 70); return () => window.clearInterval(timer); }, []);
  const requestBrowserNotificationPermission = async () => { if (typeof Notification === "undefined") return; const permission = await Notification.requestPermission(); setBrowserNotificationPermission(permission); if (permission === "granted") setAlertsEnabled(true); };
  const requestOrientationPermission = async () => { setOrientationPermissionState("granted"); };
  const handleAddTask = () => {};
  const handleDeleteTask = (id) => setTasks((prev) => prev.filter((task) => task.id !== id));
  const startEditTask = (task) => { setEditingTaskId(task.id); setEditTitle(task.title); setEditFromLabel(task.fromLabel); setEditToLabel(task.toLabel); setEditStart(task.startTime); setEditEnd(task.endTime); setEditMode(task.mode); setEditArrivalRadius(task.arrivalRadiusMeters || 120); };
  const cancelEditTask = () => setEditingTaskId(null);
  const saveEditTask = () => setEditingTaskId(null);
  const markTaskStatus = (id, status) => setTasks((prev) => prev.map((task) => task.id === id ? { ...task, status } : task));
  const clearAlertLog = () => setAlertLog([]);
  const previewOptimizedOrder = () => setOptimizedPreviewIds(dayTasks.map((t) => t.id));
  const applyDayOptimization = () => setTasks((prev) => applyOptimizedOrder(prev, selectedDay));
  return <div className="min-h-screen bg-[#06101d] text-slate-100 p-4"><div className="text-white">ZIPをご利用ください。キャンバスの最新版をVite一式として同梱しています。</div></div>;
}

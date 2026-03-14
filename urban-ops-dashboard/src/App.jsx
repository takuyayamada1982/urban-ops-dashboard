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

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function bearingDegrees(from, to) {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLng = toRadians(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const raw = (Math.atan2(y, x) * 180) / Math.PI;
  return (raw + 360) % 360;
}

function minutesBetween(startTime, endTime) {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function estimateIdealMinutes(task) {
  const meters = haversineMeters(task.from, task.to);
  const speed = MODE_META[task.mode].speedKmh;
  return Math.max(1, Math.round((meters / 1000 / speed) * 60));
}

function optimizeTasks(tasks) {
  const currentDay = tasks.filter((task) => task.day === "day1");
  const suggestions = [];

  currentDay.forEach((task, index) => {
    const planned = Math.max(1, minutesBetween(task.startTime, task.endTime));
    const ideal = estimateIdealMinutes(task);
    const gap = planned - ideal;

    if (gap >= 15) {
      suggestions.push({
        id: `slack-${task.id}`,
        level: "mid",
        title: `${task.title} に余白あり`,
        detail: `想定所要 ${ideal}分に対し、予定は ${planned}分です。前後の行動を前倒しできる余地があります。`,
      });
    }

    if (gap <= -5) {
      suggestions.push({
        id: `tight-${task.id}`,
        level: "high",
        title: `${task.title} がタイト`,
        detail: `想定所要 ${ideal}分に対し、予定は ${planned}分です。遅延吸収のため余裕時間を追加してください。`,
      });
    }

    const next = currentDay[index + 1];
    if (next && task.toLabel === next.fromLabel && task.mode !== next.mode) {
      suggestions.push({
        id: `handoff-${task.id}`,
        level: "low",
        title: `${task.toLabel} で移動モード切替`,
        detail: `同地点で ${MODE_META[task.mode].label} → ${MODE_META[next.mode].label} へ切替です。乗換や準備時間を明示すると安定します。`,
      });
    }
  });

  if (!suggestions.length) {
    suggestions.push({
      id: "stable-plan",
      level: "low",
      title: "現状の計画は安定",
      detail:
        "大きな時間衝突は見当たりません。現地混雑や遅延だけ監視すれば運用しやすい状態です。",
    });
  }

  return suggestions;
}

function loadAlertLog() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ALERT_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadTasks() {
  if (typeof window === "undefined") return INITIAL_TASKS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_TASKS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : INITIAL_TASKS;
  } catch {
    return INITIAL_TASKS;
  }
}

function createTaskId() {
  return Math.random().toString(36).slice(2, 10);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizePoint(point, bounds) {
  const lngRange = Math.max(bounds.maxLng - bounds.minLng, 0.0001);
  const latRange = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
  const x = 8 + ((point.lng - bounds.minLng) / lngRange) * 84;
  const y = 12 + (1 - (point.lat - bounds.minLat) / latRange) * 76;
  return { x: clamp(x, 6, 94), y: clamp(y, 8, 92) };
}

function buildMapBounds(tasks, currentLocation) {
  const points = tasks.flatMap((task) => [task.from, task.to]);
  if (currentLocation) points.push(currentLocation);
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return {
    minLat: Math.min(...lats) - 0.01,
    maxLat: Math.max(...lats) + 0.01,
    minLng: Math.min(...lngs) - 0.01,
    maxLng: Math.max(...lngs) + 0.01,
  };
}

function buildTaskPlot(task, bounds) {
  return {
    from: normalizePoint(task.from, bounds),
    to: normalizePoint(task.to, bounds),
  };
}

function getDirectionArrowDegrees(heading, currentLocation, target) {
  if (currentLocation && target) return bearingDegrees(currentLocation, target);
  if (heading !== null) return heading;
  return null;
}

function estimateRemainingMinutes(currentLocation, task) {
  if (!task) return null;
  const origin = currentLocation || task.from;
  const meters = haversineMeters(origin, task.to);
  const speed = MODE_META[task.mode].speedKmh;
  return Math.max(1, Math.round((meters / 1000 / speed) * 60));
}

function detectAutoStatuses(tasks, currentLocation, selectedDay) {
  if (!currentLocation) return tasks;

  const dayTasks = tasks.filter((task) => task.day === selectedDay);
  if (!dayTasks.length) return tasks;

  const doneIds = new Set();
  let doingId = null;
  let nextId = null;

  for (let i = 0; i < dayTasks.length; i += 1) {
    const task = dayTasks[i];
    const arrivalRadius = task.arrivalRadiusMeters || 150;
    const toDistance = haversineMeters(currentLocation, task.to);
    const fromDistance = haversineMeters(currentLocation, task.from);

    if (toDistance <= arrivalRadius) {
      doneIds.add(task.id);
      continue;
    }

    if (
      fromDistance <= Math.max(arrivalRadius * 1.2, 180) ||
      i === 0 ||
      doneIds.has(dayTasks[i - 1]?.id || "")
    ) {
      doingId = task.id;
      nextId = dayTasks[i + 1]?.id || null;
      break;
    }
  }

  if (!doingId) {
    const firstOpen = dayTasks.find((task) => !doneIds.has(task.id));
    doingId = firstOpen?.id || null;
    nextId = firstOpen
      ? dayTasks[
          dayTasks.findIndex((task) => task.id === firstOpen.id) + 1
        ]?.id || null
      : null;
  }

  return tasks.map((task) => {
    if (task.day !== selectedDay) return task;
    if (doneIds.has(task.id)) return { ...task, status: "done" };
    if (task.id === doingId) return { ...task, status: "doing" };
    if (task.id === nextId) return { ...task, status: "todo" };
    return { ...task, status: task.status === "done" ? "done" : "todo" };
  });
}

function scoreTaskForOrdering(task, previousTask) {
  const priorityWeight = (4 - (task.priority || 1)) * 100;
  const [hour, minute] = task.startTime.split(":").map(Number);
  const timeWeight = hour * 60 + minute;
  const hopDistance = previousTask
    ? haversineMeters(previousTask.to, task.from)
    : 0;
  const modePenalty =
    task.mode === "walk"
      ? 5
      : task.mode === "bike"
      ? 10
      : task.mode === "car"
      ? 15
      : 20;
  return priorityWeight + timeWeight + hopDistance / 100 + modePenalty;
}

function suggestOptimizedOrder(dayTasks) {
  const pool = [...dayTasks];
  if (pool.length <= 1) return pool;

  const ordered = [];
  pool.sort(
    (a, b) => scoreTaskForOrdering(a, null) - scoreTaskForOrdering(b, null)
  );
  ordered.push(pool.shift());

  while (pool.length) {
    const previousTask = ordered[ordered.length - 1];
    pool.sort(
      (a, b) =>
        scoreTaskForOrdering(a, previousTask) -
        scoreTaskForOrdering(b, previousTask)
    );
    ordered.push(pool.shift());
  }

  return ordered.filter(Boolean);
}

function applyOptimizedOrder(tasks, selectedDay) {
  const targetTasks = tasks.filter((task) => task.day === selectedDay);
  const optimized = suggestOptimizedOrder(targetTasks);
  const optimizedIds = optimized.map((task) => task.id);
  const optimizedMap = new Map(
    optimized.map((task, index) => [task.id, { ...task, orderIndex: index }])
  );

  const dayBlock = tasks
    .filter((task) => task.day === selectedDay)
    .sort((a, b) => optimizedIds.indexOf(a.id) - optimizedIds.indexOf(b.id))
    .map((task) => optimizedMap.get(task.id) || task);

  const otherDays = tasks.filter((task) => task.day !== selectedDay);
  return [...otherDays, ...dayBlock];
}

function buildAlerts(
  tasks,
  currentLocation,
  selectedDay,
  nowDate = new Date(),
  gpsError = ""
) {
  const alerts = [];
  const dayTasks = tasks.filter((task) => task.day === selectedDay);
  const doingTask = dayTasks.find((task) => task.status === "doing") || null;
  const nextTask = dayTasks.find((task) => task.status === "todo") || null;

  if (gpsError) {
    alerts.push({
      id: `gps-lost-${selectedDay}`,
      kind: "gpsLost",
      level: "high",
      title: "GPSシグナルを確認できません",
      detail:
        "位置情報が取得できていないため、自動進行判定が一時停止しています。",
    });
  }

  if (doingTask) {
    const plannedMinutes = Math.max(
      1,
      minutesBetween(doingTask.startTime, doingTask.endTime)
    );
    const remainMinutes = estimateRemainingMinutes(currentLocation, doingTask);

    if (currentLocation) {
      const remainMeters = Math.round(
        haversineMeters(currentLocation, doingTask.to)
      );
      if (
        remainMeters <= Math.max(doingTask.arrivalRadiusMeters || 120, 120)
      ) {
        alerts.push({
          id: `arrival-${doingTask.id}`,
          kind: "arrival",
          level: "high",
          title: `${doingTask.toLabel} に到着圏内`,
          detail:
            "到着判定半径に入りました。次の行動へ切替を確認してください。",
        });
      } else {
        alerts.push({
          id: `progress-${doingTask.id}`,
          kind: "progress",
          level: "mid",
          title: `${doingTask.fromLabel} → ${doingTask.toLabel} を移動中`,
          detail: `残り約 ${remainMeters}m / ${remainMinutes || "--"}分です。`,
        });
      }

      if (remainMinutes !== null && remainMinutes > plannedMinutes + 5) {
        alerts.push({
          id: `delay-${doingTask.id}`,
          kind: "delayRisk",
          level: "high",
          title: `${doingTask.title} に遅延リスク`,
          detail: `想定残り ${remainMinutes}分で、予定枠 ${plannedMinutes}分を超えています。後続タスクへの影響を確認してください。`,
        });
      }

      const fromDistance = Math.round(
        haversineMeters(currentLocation, doingTask.from)
      );
      if (
        fromDistance <=
        Math.max((doingTask.arrivalRadiusMeters || 120) * 1.2, 180)
      ) {
        alerts.push({
          id: `move-start-${doingTask.id}`,
          kind: "moveStart",
          level: "mid",
          title: `${doingTask.title} を開始`,
          detail: `${doingTask.fromLabel} を出発し、${doingTask.toLabel} へ向かっています。`,
        });
      }

      if (remainMeters > 80 && fromDistance <= 60) {
        alerts.push({
          id: `stop-long-${doingTask.id}`,
          kind: "longStop",
          level: "mid",
          title: `${doingTask.fromLabel} 周辺で停止の可能性`,
          detail:
            "出発地点付近に留まっています。移動開始漏れや経路確認を見直してください。",
        });
      }
    }
  }

  if (nextTask) {
    const [h, m] = nextTask.startTime.split(":").map(Number);
    const target = new Date(nowDate);
    target.setHours(h, m, 0, 0);
    const diffMin = Math.round((target.getTime() - nowDate.getTime()) / 60000);
    if (diffMin >= 0 && diffMin <= 15) {
      alerts.push({
        id: `upcoming-${nextTask.id}`,
        kind: "upcoming",
        level: diffMin <= 5 ? "high" : "mid",
        title: `${nextTask.title} がまもなく開始`,
        detail: `開始予定 ${nextTask.startTime} まであと ${diffMin}分です。`,
      });
    }
  }

  if (!alerts.length) {
    alerts.push({
      id: `stable-${selectedDay}`,
      kind: "stable",
      level: "low",
      title: "現在の通知はありません",
      detail: "位置変化や時刻接近に応じて、ここへ通知を表示します。",
    });
  }

  return alerts;
}

function runDevOnlyTests() {
  if (
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "production"
  )
    return;

  console.assert(
    minutesBetween("07:20", "07:32") === 12,
    "minutesBetween should compute simple intervals"
  );
  console.assert(
    Math.round(haversineMeters({ lat: 35, lng: 139 }, { lat: 35, lng: 139 })) ===
      0,
    "distance to self should be zero"
  );
  console.assert(
    Math.round(bearingDegrees({ lat: 35, lng: 139 }, { lat: 35, lng: 140 })) ===
      90,
    "eastward bearing should be about 90°"
  );
  console.assert(
    estimateIdealMinutes(INITIAL_TASKS[0]) >= 1,
    "ideal minutes should be positive"
  );
  console.assert(
    optimizeTasks(INITIAL_TASKS).length >= 1,
    "optimizer should emit at least one suggestion"
  );

  const bounds = buildMapBounds(INITIAL_TASKS, null);
  const plot = buildTaskPlot(INITIAL_TASKS[0], bounds);
  console.assert(
    plot.from.x >= 0 && plot.from.x <= 100,
    "plot x should stay in viewbox"
  );
  console.assert(
    plot.to.y >= 0 && plot.to.y <= 100,
    "plot y should stay in viewbox"
  );
  console.assert(
    getDirectionArrowDegrees(180, null, null) === 180,
    "fallback heading should be used when target is missing"
  );
  console.assert(
    estimateRemainingMinutes(null, INITIAL_TASKS[0]) !== null,
    "remaining minutes should be computed"
  );
  const auto = detectAutoStatuses(INITIAL_TASKS, INITIAL_TASKS[1].from, "day1");
  console.assert(
    auto.some((task) => task.status === "doing"),
    "auto detection should assign doing status"
  );
  const optimized = suggestOptimizedOrder(
    INITIAL_TASKS.filter((task) => task.day === "day1")
  );
  console.assert(
    optimized.length ===
      INITIAL_TASKS.filter((task) => task.day === "day1").length,
    "optimized order should keep task count"
  );
  const alerts = buildAlerts(
    INITIAL_TASKS,
    INITIAL_TASKS[1].from,
    "day1",
    new Date("2026-03-14T07:45:00"),
    ""
  );
  console.assert(alerts.length >= 1, "alerts should be generated");
}

runDevOnlyTests();

export default function CyberMissionDashboardMock() {
  const [tasks, setTasks] = useState(() => loadTasks());
  const [selectedDay, setSelectedDay] = useState("day1");
  const [selectedTaskId, setSelectedTaskId] = useState(INITIAL_TASKS[1].id);
  const [mobileTab, setMobileTab] = useState("map");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [heading, setHeading] = useState(null);
  const [gpsError, setGpsError] = useState("");
  const [orientationPermissionState, setOrientationPermissionState] =
    useState("unknown");
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
  const [browserNotificationPermission, setBrowserNotificationPermission] =
    useState("default");
  const [dismissedAlertIds, setDismissedAlertIds] = useState([]);
  const [alertLog, setAlertLog] = useState(() => loadAlertLog());
  const sentBrowserNotificationIdsRef = useRef(new Set());
  const watchIdRef = useRef(null);

  const dayTasks = useMemo(
    () => tasks.filter((task) => task.day === selectedDay),
    [tasks, selectedDay]
  );
  const currentTask = useMemo(
    () =>
      dayTasks.find((task) => task.status === "doing") ||
      dayTasks.find((task) => task.id === selectedTaskId) ||
      dayTasks[0] ||
      null,
    [dayTasks, selectedTaskId]
  );
  const nextTask = useMemo(
    () => dayTasks.find((task) => task.status === "todo") || null,
    [dayTasks]
  );
  const optimization = useMemo(() => optimizeTasks(tasks), [tasks]);
  const remainingDistanceMeters = useMemo(() => {
    if (!currentTask) return null;
    const origin = currentLocation || currentTask.from;
    return Math.round(haversineMeters(origin, currentTask.to));
  }, [currentLocation, currentTask]);
  const remainingMinutes = useMemo(
    () => estimateRemainingMinutes(currentLocation, currentTask),
    [currentLocation, currentTask]
  );
  const alerts = useMemo(() => {
    const activeAlerts = buildAlerts(
      tasks,
      currentLocation,
      selectedDay,
      new Date(),
      gpsError
    ).filter((alert) => !dismissedAlertIds.includes(alert.id));
    return activeAlerts;
  }, [tasks, currentLocation, selectedDay, dismissedAlertIds, gpsError]);

  const mapBounds = useMemo(
    () =>
      buildMapBounds(
        dayTasks.length ? dayTasks : INITIAL_TASKS,
        currentLocation
      ),
    [dayTasks, currentLocation]
  );
  const plottedTasks = useMemo(
    () => dayTasks.map((task) => ({ task, plot: buildTaskPlot(task, mapBounds) })),
    [dayTasks, mapBounds]
  );
  const currentLocationPlot = useMemo(
    () => (currentLocation ? normalizePoint(currentLocation, mapBounds) : null),
    [currentLocation, mapBounds]
  );
  const routeHeading = useMemo(
    () =>
      getDirectionArrowDegrees(
        heading,
        currentLocation,
        currentTask?.to || null
      ),
    [heading, currentLocation, currentTask]
  );
  const activePlot = useMemo(
    () => (currentTask ? buildTaskPlot(currentTask, mapBounds) : null),
    [currentTask, mapBounds]
  );
  const movingPlotPoint = useMemo(() => {
    if (!activePlot) return null;
    return {
      x: activePlot.from.x + (activePlot.to.x - activePlot.from.x) * flightProgress,
      y: activePlot.from.y + (activePlot.to.y - activePlot.from.y) * flightProgress,
    };
  }, [activePlot, flightProgress]);

  useEffect(() => {
    setSelectedTaskId((prev) =>
      dayTasks.some((task) => task.id === prev) ? prev : dayTasks[0]?.id || ""
    );
  }, [dayTasks]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ALERT_LOG_STORAGE_KEY, JSON.stringify(alertLog));
  }, [alertLog]);

  useEffect(() => {
    const now = new Date().toLocaleString("ja-JP");
    setAlertLog((prev) => {
      const seen = new Set(prev.map((item) => `${item.id}-${item.detail}`));
      const additions = alerts
        .filter((alert) => alert.kind !== "stable")
        .filter((alert) => !seen.has(`${alert.id}-${alert.detail}`))
        .map((alert) => ({
          id: alert.id,
          kind: alert.kind,
          level: alert.level,
          title: alert.title,
          detail: alert.detail,
          loggedAt: now,
        }));
      if (!additions.length) return prev;
      return [...additions, ...prev].slice(0, 50);
    });
  }, [alerts]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const activeIds = new Set(alerts.map((alert) => alert.id));
    sentBrowserNotificationIdsRef.current.forEach((id) => {
      if (!activeIds.has(id)) sentBrowserNotificationIdsRef.current.delete(id);
    });
  }, [alerts]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined")
      return;
    setBrowserNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      !alertsEnabled ||
      browserNotificationPermission !== "granted" ||
      typeof Notification === "undefined"
    ) {
      return;
    }

    alerts
      .filter((alert) =>
        ["arrival", "upcoming", "delayRisk", "gpsLost"].includes(alert.kind)
      )
      .forEach((alert) => {
        if (sentBrowserNotificationIdsRef.current.has(alert.id)) return;
        sentBrowserNotificationIdsRef.current.add(alert.id);
        try {
          new Notification(alert.title, {
            body: alert.detail,
            tag: alert.id,
            renotify: false,
          });
        } catch {
          // ignore notification failures in unsupported contexts
        }
      });
  }, [alerts, alertsEnabled, browserNotificationPermission]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) {
      setGpsError("この端末ではGPSが利用できません。");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGpsError("");
      },
      (error) => {
        setGpsError(error.message || "GPSの取得に失敗しました。");
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!currentLocation) return;
    setTasks((prev) => detectAutoStatuses(prev, currentLocation, selectedDay));
  }, [currentLocation, selectedDay]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (event) => {
      if (typeof event.alpha === "number") {
        setHeading(event.alpha);
        setOrientationError("");
      }
    };

    window.addEventListener("deviceorientation", handler, true);

    const orientationApi = window.DeviceOrientationEvent;
    if (typeof orientationApi === "undefined") {
      setOrientationPermissionState("unsupported");
    } else if (typeof orientationApi.requestPermission === "function") {
      setOrientationPermissionState("unknown");
    } else {
      setOrientationPermissionState("granted");
    }

    return () => window.removeEventListener("deviceorientation", handler, true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setInterval(() => {
      setFlightProgress((prev) => {
        const next = prev + 0.025;
        return next > 1 ? 0 : next;
      });
    }, 70);
    return () => window.clearInterval(timer);
  }, []);

  const requestOrientationPermission = async () => {
    if (typeof window === "undefined") return;

    try {
      const orientationApi = window.DeviceOrientationEvent;
      if (typeof orientationApi === "undefined") {
        setOrientationPermissionState("unsupported");
        setOrientationError("この端末・ブラウザでは方位APIが利用できません。");
        return;
      }

      if (typeof orientationApi.requestPermission === "function") {
        const result = await orientationApi.requestPermission();
        if (result === "granted") {
          setOrientationPermissionState("granted");
          setOrientationError("");
        } else {
          setOrientationPermissionState("denied");
          setOrientationError("方位センサーの許可が拒否されました。");
        }
        return;
      }

      setOrientationPermissionState("granted");
      setOrientationError("");
    } catch (error) {
      setOrientationPermissionState("denied");
      setOrientationError(
        error instanceof Error
          ? error.message
          : "方位センサーの有効化に失敗しました。"
      );
    }
  };

  const handleAddTask = () => {
    if (
      !newTaskTitle.trim() ||
      !newTaskFromLabel.trim() ||
      !newTaskToLabel.trim()
    )
      return;

    const anchor =
      currentLocation || currentTask?.to || { lat: 35.6391, lng: 139.3364 };
    const delta = 0.005 + Math.random() * 0.004;

    const newTask = {
      id: createTaskId(),
      day: selectedDay,
      title: newTaskTitle.trim(),
      status: "todo",
      mode: newTaskMode,
      startTime: newTaskStart,
      endTime: newTaskEnd,
      fromLabel: newTaskFromLabel.trim(),
      toLabel: newTaskToLabel.trim(),
      from: anchor,
      to: { lat: anchor.lat + delta * 0.6, lng: anchor.lng + delta },
      note: "新規追加タスク",
      priority: 2,
      arrivalRadiusMeters: 120,
    };

    setTasks((prev) => [...prev, newTask]);
    setNewTaskTitle("");
    setNewTaskFromLabel("");
    setNewTaskToLabel("");
    setSelectedTaskId(newTask.id);
    setMobileTab("tasks");
  };

  const handleDeleteTask = (id) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
    if (editingTaskId === id) setEditingTaskId(null);
  };

  const startEditTask = (task) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditFromLabel(task.fromLabel);
    setEditToLabel(task.toLabel);
    setEditStart(task.startTime);
    setEditEnd(task.endTime);
    setEditMode(task.mode);
    setEditArrivalRadius(task.arrivalRadiusMeters || 120);
  };

  const cancelEditTask = () => setEditingTaskId(null);

  const saveEditTask = () => {
    if (
      !editingTaskId ||
      !editTitle.trim() ||
      !editFromLabel.trim() ||
      !editToLabel.trim()
    )
      return;

    setTasks((prev) =>
      prev.map((task) =>
        task.id === editingTaskId
          ? {
              ...task,
              title: editTitle.trim(),
              fromLabel: editFromLabel.trim(),
              toLabel: editToLabel.trim(),
              startTime: editStart,
              endTime: editEnd,
              mode: editMode,
              arrivalRadiusMeters: Math.max(30, editArrivalRadius),
            }
          : task
      )
    );
    setEditingTaskId(null);
  };

  const markTaskStatus = (id, status) => {
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, status } : task))
    );
  };

  const dismissAlert = (id) => {
    setDismissedAlertIds((prev) => [...prev, id]);
    sentBrowserNotificationIdsRef.current.add(id);
  };

  const clearAlertLog = () => {
    setAlertLog([]);
  };

  const requestBrowserNotificationPermission = async () => {
    if (typeof window === "undefined" || typeof Notification === "undefined")
      return;
    const permission = await Notification.requestPermission();
    setBrowserNotificationPermission(permission);
    if (permission === "granted") setAlertsEnabled(true);
  };

  const previewOptimizedOrder = () => {
    const optimized = suggestOptimizedOrder(dayTasks);
    setOptimizedPreviewIds(optimized.map((task) => task.id));
  };

  const applyDayOptimization = () => {
    setTasks((prev) => applyOptimizedOrder(prev, selectedDay));
    const optimized = suggestOptimizedOrder(dayTasks);
    setOptimizedPreviewIds(optimized.map((task) => task.id));
  };

  return (
    <div className="min-h-screen bg-[#06101d] text-slate-100">
      <style>{`
        @keyframes opsPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.38; transform: scale(1.18); }
        }
        @keyframes opsGlow {
          0%, 100% { opacity: 0.95; }
          50% { opacity: 0.35; }
        }
        @keyframes opsTextBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>

      <div className="pointer-events-none fixed inset-0 opacity-25 [background-image:linear-gradient(rgba(34,211,238,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.08)_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.18),transparent_25%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.14),transparent_20%)]" />

      <div className="relative mx-auto max-w-[430px] px-3 pb-24 pt-4 md:max-w-[1200px] md:px-6 md:pb-8">
        <div className="rounded-[2.2rem] border border-cyan-400/20 bg-[#0a1220] p-2 shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_24px_80px_rgba(0,0,0,0.55)] md:rounded-[2rem]">
          <div className="relative overflow-hidden rounded-[1.9rem] border border-white/10 bg-[#07111f] md:rounded-[1.5rem]">
            <div className="pointer-events-none absolute left-1/2 top-2 z-30 h-7 w-36 -translate-x-1/2 rounded-full bg-black/75 md:hidden" />

            <div className="relative z-10 border-b border-white/10 px-4 pb-3 pt-5">
              <div className="mb-3 flex items-center justify-between text-[11px] text-slate-300 md:text-xs">
                <span>9:41</span>
                <span className="text-cyan-200">iPhone 17 Mission HUD</span>
                <span>{heading !== null ? `${Math.round(heading)}°` : "---°"}</span>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={requestBrowserNotificationPermission}
                  className="rounded-2xl border border-fuchsia-300/30 bg-fuchsia-400/10 px-3 py-2 text-xs font-medium text-fuchsia-100"
                >
                  通知を有効化
                </button>
                <div className="text-[11px] text-slate-400">
                  {browserNotificationPermission === "granted"
                    ? "ブラウザ通知は有効"
                    : browserNotificationPermission === "denied"
                    ? "ブラウザ通知は拒否されています"
                    : "ブラウザ通知は未許可"}
                </div>
                <button
                  onClick={requestOrientationPermission}
                  className="rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-100"
                >
                  向きの取得を有効化
                </button>
                <div className="text-[11px] text-slate-400">
                  {orientationPermissionState === "granted"
                    ? "方位センサー有効"
                    : orientationPermissionState === "denied"
                    ? "方位センサー拒否"
                    : orientationPermissionState === "unsupported"
                    ? "方位センサー非対応"
                    : "Safariではボタン押下後に許可が必要な場合があります"}
                </div>
              </div>

              <div className="mb-3 rounded-3xl border border-fuchsia-400/20 bg-slate-950/70 p-4 backdrop-blur-xl">
                <div className="mb-3 flex items-center justify-between gap-2 text-fuchsia-200">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    <span className="font-medium">通知センター</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {alertsEnabled ? "端末通知ON" : "画面通知のみ"}
                  </div>
                </div>
                <div className="space-y-2">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-2xl border p-3 ${
                        alert.level === "high"
                          ? "border-rose-300/30 bg-rose-400/10"
                          : alert.level === "mid"
                          ? "border-amber-300/30 bg-amber-400/10"
                          : "border-white/10 bg-white/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-white">
                            {alert.title}
                          </div>
                          <div className="mt-1 text-xs text-slate-200">
                            {alert.detail}
                          </div>
                        </div>
                        {alert.kind !== "stable" ? (
                          <button
                            onClick={() => dismissAlert(alert.id)}
                            className="rounded-xl border border-white/10 p-2 text-slate-300"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-4 backdrop-blur-xl">
                <div className="mb-2 flex items-center gap-2 text-cyan-300">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-[10px] uppercase tracking-[0.28em]">
                    Purpose Locked
                  </span>
                </div>
                <h1 className="text-lg font-bold text-white md:text-2xl">
                  {PURPOSE_LOCK.productName}
                </h1>
                <p className="mt-2 text-xs text-slate-300 md:text-sm">
                  {PURPOSE_LOCK.lockedPurpose}
                </p>
                <p className="mt-2 text-xs text-fuchsia-200 md:text-sm">
                  Goal: {PURPOSE_LOCK.lockedGoal}
                </p>
              </div>
            </div>

            <div className="grid gap-4 px-3 pb-24 pt-3 md:grid-cols-[1.2fr_0.8fr] md:px-4 md:pb-4">
              <div className={mobileTab === "map" ? "block" : "hidden md:block"}>
                <div className="rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-3 backdrop-blur-xl">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-cyan-300">
                      <MapPinned className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        Cyber Mission Map
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-300">
                      <Compass className="h-3.5 w-3.5" />
                      {heading !== null ? `${Math.round(heading)}°` : "方位未取得"}
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-[1.6rem] border border-cyan-400/20 bg-[radial-gradient(circle_at_center,rgba(8,47,73,0.75),rgba(2,6,23,0.95))]">
                    <div className="absolute inset-0 z-0 opacity-30 [background-image:linear-gradient(rgba(34,211,238,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.08)_1px,transparent_1px)] [background-size:26px_26px]" />
                    <div className="absolute inset-0 z-0 opacity-10 [background-image:radial-gradient(circle_at_20%_30%,white_1px,transparent_1px),radial-gradient(circle_at_60%_70%,white_1px,transparent_1px),radial-gradient(circle_at_75%_20%,white_1px,transparent_1px)] [background-size:120px_120px]" />

                    <div className="absolute left-3 top-3 z-20 rounded-2xl border border-white/10 bg-slate-950/70 px-2.5 py-2 text-[9px] text-slate-300 backdrop-blur-md">
                      <div className="font-medium text-cyan-200">HUD</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-fuchsia-300" />
                        計画地点
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-cyan-300" />
                        現在地
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="inline-block h-[2px] w-4 bg-cyan-300" />
                        進行ルート
                      </div>
                    </div>

                    <div className="relative h-[360px]">
                      <svg viewBox="0 0 100 100" className="h-full w-full">
                        {plottedTasks.map(({ task, plot }) => {
                          const isCurrent = task.id === currentTask?.id;
                          const isNext = task.id === nextTask?.id;
                          return (
                            <g key={`path-${task.id}`}>
                              {isCurrent ? (
                                <line
                                  x1={plot.from.x}
                                  y1={plot.from.y}
                                  x2={plot.to.x}
                                  y2={plot.to.y}
                                  stroke={MODE_META[task.mode].color}
                                  strokeWidth={4.2}
                                  strokeOpacity={0.14}
                                  style={{ animation: "opsGlow 1.2s linear infinite" }}
                                />
                              ) : null}
                              <line
                                x1={plot.from.x}
                                y1={plot.from.y}
                                x2={plot.to.x}
                                y2={plot.to.y}
                                stroke={MODE_META[task.mode].color}
                                strokeWidth={isCurrent ? 2.4 : 1}
                                strokeOpacity={isCurrent ? 0.95 : 0.55}
                                strokeDasharray={
                                  task.status === "done"
                                    ? undefined
                                    : isCurrent
                                    ? "1.2 1.2"
                                    : "2 1.5"
                                }
                                style={
                                  isCurrent
                                    ? { animation: "opsGlow 1.2s linear infinite" }
                                    : undefined
                                }
                              />
                              <circle
                                cx={plot.from.x}
                                cy={plot.from.y}
                                r={isCurrent ? 1.2 : 1}
                                fill={
                                  isCurrent
                                    ? "#cffafe"
                                    : MODE_META[task.mode].color
                                }
                              />
                              {isCurrent ? (
                                <text
                                  x={plot.from.x + 1.2}
                                  y={plot.from.y + 3.2}
                                  fill="#a5f3fc"
                                  fontSize="1.45"
                                  fontWeight="700"
                                  style={{
                                    animation: "opsTextBlink 1.2s linear infinite",
                                  }}
                                >
                                  出発
                                </text>
                              ) : null}
                              <circle
                                cx={plot.to.x}
                                cy={plot.to.y}
                                r={isCurrent || isNext ? 1.2 : 1.1}
                                fill={MODE_META[task.mode].color}
                              />
                              <text
                                x={plot.to.x + 1.2}
                                y={plot.to.y - 1.1}
                                fill="#e2e8f0"
                                fontSize="2.1"
                              >
                                {task.toLabel}
                              </text>
                              {isCurrent || isNext ? (
                                <text
                                  x={plot.to.x + 1.2}
                                  y={plot.to.y + 3.2}
                                  fill={isCurrent ? "#67e8f9" : "#f0abfc"}
                                  fontSize="1.45"
                                  fontWeight="700"
                                  style={
                                    isCurrent
                                      ? {
                                          animation:
                                            "opsTextBlink 1.2s linear infinite",
                                        }
                                      : undefined
                                  }
                                >
                                  {isCurrent ? "目的地" : "NEXT"}
                                </text>
                              ) : null}
                            </g>
                          );
                        })}

                        {movingPlotPoint ? (
                          <g
                            transform={`translate(${movingPlotPoint.x}, ${movingPlotPoint.y}) rotate(${routeHeading || 0})`}
                          >
                            <circle r={2.3} fill="rgba(34,211,238,0.14)" />
                            <path
                              d="M -2.4 -0.7 L 2.2 0 L -2.4 0.7 Z"
                              fill="#67e8f9"
                              opacity="0.98"
                            />
                          </g>
                        ) : null}

                        {currentLocationPlot ? (
                          <g>
                            <circle
                              cx={currentLocationPlot.x}
                              cy={currentLocationPlot.y}
                              r={2.2}
                              fill="rgba(34,211,238,0.14)"
                            />
                            <circle
                              cx={currentLocationPlot.x}
                              cy={currentLocationPlot.y}
                              r={1.4}
                              fill="#67e8f9"
                              stroke="#cffafe"
                              strokeWidth="0.4"
                            />
                            <text
                              x={currentLocationPlot.x + 1.4}
                              y={currentLocationPlot.y - 1.4}
                              fill="#a5f3fc"
                              fontSize="2.2"
                            >
                              現在地
                            </text>
                          </g>
                        ) : null}

                        {currentLocationPlot && routeHeading !== null ? (
                          <g
                            transform={`translate(${currentLocationPlot.x}, ${currentLocationPlot.y}) rotate(${routeHeading})`}
                          >
                            <path
                              d="M 0 -4 L 2 2 L 0 1 L -2 2 Z"
                              fill="#67e8f9"
                              opacity="0.95"
                            />
                          </g>
                        ) : null}

                        <rect
                          x="6"
                          y="8"
                          width="20"
                          height="10"
                          rx="2"
                          fill="rgba(2,6,23,0.7)"
                          stroke="rgba(255,255,255,0.08)"
                        />
                        <text x="9" y="14.5" fill="#a5f3fc" fontSize="2.2">
                          簡易サイバーマップ
                        </text>
                        <text x="9" y="17.5" fill="#94a3b8" fontSize="1.6">
                          実地図未読込時の安全フォールバック
                        </text>
                      </svg>
                    </div>
                  </div>

                  {orientationError ? (
                    <div className="mt-3 rounded-2xl border border-rose-300/30 bg-rose-400/10 p-3 text-xs text-rose-100">
                      方位: {orientationError}
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 xl:grid-cols-5">
                    <div
                      className="rounded-2xl border border-white/10 bg-slate-950/75 p-3"
                      style={
                        currentTask
                          ? { animation: "opsGlow 1.2s linear infinite" }
                          : undefined
                      }
                    >
                      <div className="mb-1 flex items-center gap-2 text-cyan-300">
                        <Navigation className="h-3.5 w-3.5" />
                        <span className="font-medium">進行中ガイド</span>
                      </div>
                      <div className="font-semibold text-white">
                        {currentTask?.fromLabel || "未設定"}
                      </div>
                      <div
                        className="my-1 text-cyan-200"
                        style={
                          currentTask
                            ? { animation: "opsTextBlink 1.2s linear infinite" }
                            : undefined
                        }
                      >
                        ↓
                      </div>
                      <div className="font-semibold text-fuchsia-200">
                        {currentTask?.toLabel || "未設定"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3">
                      <div className="text-slate-400">Now</div>
                      <div className="mt-1 font-semibold text-cyan-100">
                        {currentTask?.title || "未設定"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/10 p-3">
                      <div className="text-slate-400">Next</div>
                      <div className="mt-1 font-semibold text-fuchsia-100">
                        {nextTask?.title || "未設定"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3">
                      <div className="text-slate-400">GPS</div>
                      <div className="mt-1 font-semibold text-amber-100">
                        {gpsError ? "要許可" : currentLocation ? "有効" : "取得中"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                      <div className="text-slate-400">残り</div>
                      <div className="mt-1 font-semibold text-emerald-100">
                        {remainingDistanceMeters !== null
                          ? `${remainingDistanceMeters}m`
                          : "未計算"}
                      </div>
                      <div className="mt-1 text-[11px] text-emerald-200">
                        {remainingMinutes !== null ? `約${remainingMinutes}分` : "--"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={mobileTab === "tasks" ? "block" : "hidden md:block"}>
                <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4 backdrop-blur-xl">
                  <div className="mb-3 flex items-center justify-between gap-2 text-cyan-300">
                    <div className="flex items-center gap-2">
                      <Route className="h-4 w-4" />
                      <span className="font-medium">行動タスクリスト</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={previewOptimizedOrder}
                        className="rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-[11px] font-medium text-cyan-100"
                      >
                        順番提案
                      </button>
                      <button
                        onClick={applyDayOptimization}
                        className="rounded-2xl bg-cyan-500 px-3 py-2 text-[11px] font-semibold text-slate-950"
                      >
                        最適化を適用
                      </button>
                    </div>
                  </div>

                  {optimizedPreviewIds.length ? (
                    <div className="mb-3 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-[11px] text-cyan-50">
                      <div className="mb-2 font-semibold text-cyan-200">
                        AI提案の並び順
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {optimizedPreviewIds.map((id, index) => {
                          const task = dayTasks.find((item) => item.id === id);
                          return task ? (
                            <span
                              key={id}
                              className="rounded-full border border-cyan-200/20 bg-slate-950/70 px-2 py-1"
                            >
                              {index + 1}. {task.title}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="mb-3 grid grid-cols-3 gap-2">
                    {Object.keys(DAYS).map((day) => (
                      <button
                        key={day}
                        onClick={() => setSelectedDay(day)}
                        className={`rounded-2xl px-3 py-2 text-xs font-medium ${
                          selectedDay === day
                            ? "bg-cyan-500 text-slate-950"
                            : "bg-white/5 text-slate-300"
                        }`}
                      >
                        {day === "day1" ? "1日目" : day === "day2" ? "2日目" : "3日目"}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2 rounded-3xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      新規タスク作成
                    </div>
                    <input
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="行動タイトル"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm outline-none"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={newTaskFromLabel}
                        onChange={(e) => setNewTaskFromLabel(e.target.value)}
                        placeholder="出発地点"
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm outline-none"
                      />
                      <input
                        value={newTaskToLabel}
                        onChange={(e) => setNewTaskToLabel(e.target.value)}
                        placeholder="到着地点"
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="time"
                        value={newTaskStart}
                        onChange={(e) => setNewTaskStart(e.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm outline-none"
                      />
                      <input
                        type="time"
                        value={newTaskEnd}
                        onChange={(e) => setNewTaskEnd(e.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm outline-none"
                      />
                    </div>
                    <select
                      value={newTaskMode}
                      onChange={(e) => setNewTaskMode(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm outline-none"
                    >
                      {Object.entries(MODE_META).map(([key, meta]) => (
                        <option key={key} value={key}>
                          {meta.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddTask}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950"
                    >
                      <Plus className="h-4 w-4" /> タスク追加
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {dayTasks.map((task) => {
                      const distance = Math.round(haversineMeters(task.from, task.to));
                      const isSelected = task.id === currentTask?.id;
                      const isEditing = task.id === editingTaskId;
                      return (
                        <div
                          key={task.id}
                          className={`rounded-2xl border p-3 ${
                            isSelected
                              ? "border-cyan-300/40 bg-cyan-400/10"
                              : "border-white/10 bg-white/5"
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                              <div className="font-semibold text-white">
                                {task.title}
                              </div>
                              {optimizedPreviewIds.length &&
                              optimizedPreviewIds.includes(task.id) ? (
                                <div className="mt-1 text-[11px] text-cyan-200">
                                  提案順: {optimizedPreviewIds.indexOf(task.id) + 1}
                                </div>
                              ) : null}
                              <div className="text-xs text-slate-400">
                                {task.fromLabel} → {task.toLabel}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => startEditTask(task)}
                                className="rounded-xl border border-white/10 p-2 text-slate-300"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTask(task.id)}
                                className="rounded-xl border border-white/10 p-2 text-slate-300"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <div className="text-xs text-slate-300">
                            {task.startTime} - {task.endTime} /{" "}
                            {MODE_META[task.mode].label} / 約{distance}m / 到着判定{" "}
                            {task.arrivalRadiusMeters || 120}m
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => markTaskStatus(task.id, "todo")}
                              className="rounded-xl bg-white/5 px-2 py-1 text-xs"
                            >
                              Todo
                            </button>
                            <button
                              onClick={() => markTaskStatus(task.id, "doing")}
                              className="rounded-xl bg-cyan-400/10 px-2 py-1 text-xs text-cyan-100"
                            >
                              Doing
                            </button>
                            <button
                              onClick={() => markTaskStatus(task.id, "done")}
                              className="rounded-xl bg-emerald-400/10 px-2 py-1 text-xs text-emerald-100"
                            >
                              Done
                            </button>
                          </div>

                          {isEditing ? (
                            <div className="mt-3 space-y-2 rounded-2xl border border-cyan-300/20 bg-slate-950/80 p-3">
                              <div className="text-xs uppercase tracking-[0.18em] text-cyan-200">
                                タスク編集
                              </div>
                              <input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  value={editFromLabel}
                                  onChange={(e) => setEditFromLabel(e.target.value)}
                                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                                />
                                <input
                                  value={editToLabel}
                                  onChange={(e) => setEditToLabel(e.target.value)}
                                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="time"
                                  value={editStart}
                                  onChange={(e) => setEditStart(e.target.value)}
                                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                                />
                                <input
                                  type="time"
                                  value={editEnd}
                                  onChange={(e) => setEditEnd(e.target.value)}
                                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <select
                                  value={editMode}
                                  onChange={(e) => setEditMode(e.target.value)}
                                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                                >
                                  {Object.entries(MODE_META).map(([key, meta]) => (
                                    <option key={key} value={key}>
                                      {meta.label}
                                    </option>
                                  ))}
                                </select>
                                <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm">
                                  <div className="text-[11px] text-slate-400">
                                    到着判定半径
                                  </div>
                                  <div className="mt-1 flex items-center gap-2">
                                    <input
                                      type="range"
                                      min={30}
                                      max={500}
                                      step={10}
                                      value={editArrivalRadius}
                                      onChange={(e) =>
                                        setEditArrivalRadius(Number(e.target.value))
                                      }
                                      className="w-full"
                                    />
                                    <span className="min-w-[52px] text-right text-cyan-100">
                                      {editArrivalRadius}m
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={saveEditTask}
                                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950"
                                >
                                  <Save className="h-4 w-4" /> 保存
                                </button>
                                <button
                                  onClick={cancelEditTask}
                                  className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-sm text-slate-200"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className={mobileTab === "ai" ? "block" : "hidden md:block"}>
                <div className="space-y-4">
                  <div className="rounded-3xl border border-fuchsia-400/20 bg-slate-950/70 p-4 backdrop-blur-xl">
                    <div className="mb-3 flex items-center justify-between gap-2 text-fuchsia-200">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4" />
                        <span className="font-medium">通知ログ</span>
                      </div>
                      <button
                        onClick={clearAlertLog}
                        className="rounded-2xl border border-white/10 px-3 py-2 text-[11px] text-slate-300"
                      >
                        ログ消去
                      </button>
                    </div>
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {alertLog.length ? (
                        alertLog.map((item, index) => (
                          <div
                            key={`${item.id}-${index}`}
                            className={`rounded-2xl border p-3 ${
                              item.level === "high"
                                ? "border-rose-300/30 bg-rose-400/10"
                                : item.level === "mid"
                                ? "border-amber-300/30 bg-amber-400/10"
                                : "border-white/10 bg-white/5"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-white">
                                  {item.title}
                                </div>
                                <div className="mt-1 text-xs text-slate-200">
                                  {item.detail}
                                </div>
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {item.loggedAt}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                          通知履歴はまだありません。
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-fuchsia-400/20 bg-slate-950/70 p-4 backdrop-blur-xl">
                    <div className="mb-3 flex items-center gap-2 text-fuchsia-200">
                      <Bot className="h-4 w-4" />
                      <span className="font-medium">
                        AI最適化エンジン（ローカル簡易版）
                      </span>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                      現在は無料で動く簡易最適化として、距離・想定速度・予定時間・モード切替・余白過不足から改善候補を出します。実地図が読める環境では、その座標を使ってさらに高精度化できます。
                    </div>
                    <div className="mt-3 space-y-2">
                      {optimization.map((item) => (
                        <div
                          key={item.id}
                          className={`rounded-2xl border p-3 ${
                            item.level === "high"
                              ? "border-rose-300/30 bg-rose-400/10"
                              : item.level === "mid"
                              ? "border-amber-300/30 bg-amber-400/10"
                              : "border-cyan-300/30 bg-cyan-400/10"
                          }`}
                        >
                          <div className="mb-1 flex items-center gap-2 font-semibold text-white">
                            <ShieldAlert className="h-4 w-4" />
                            {item.title}
                          </div>
                          <div className="text-xs text-slate-200">
                            {item.detail}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-4 backdrop-blur-xl">
                    <div className="mb-3 flex items-center gap-2 text-cyan-200">
                      <Target className="h-4 w-4" />
                      <span className="font-medium">
                        現在地 / 向き / ルート指標
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-slate-400">現在地</div>
                        <div className="mt-1 text-white">
                          {currentLocation
                            ? `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}`
                            : "未取得"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-slate-400">端末の向き</div>
                        <div className="mt-1 text-white">
                          {heading !== null
                            ? `${Math.round(heading)}°`
                            : orientationPermissionState === "unknown"
                            ? "許可待ち"
                            : "未取得"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-slate-400">目的地方位</div>
                        <div className="mt-1 text-white">
                          {currentLocation && currentTask
                            ? `${Math.round(
                                bearingDegrees(currentLocation, currentTask.to)
                              )}°`
                            : routeHeading !== null
                            ? `${Math.round(routeHeading)}°`
                            : "未計算"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-slate-400">目的地距離</div>
                        <div className="mt-1 text-white">
                          {currentLocation && currentTask
                            ? `${Math.round(
                                haversineMeters(currentLocation, currentTask.to)
                              )}m`
                            : currentTask
                            ? `${Math.round(
                                haversineMeters(
                                  currentTask.from,
                                  currentTask.to
                                )
                              )}m`
                            : "未計算"}
                        </div>
                      </div>
                    </div>
                    {gpsError ? (
                      <div className="mt-3 rounded-2xl border border-rose-300/30 bg-rose-400/10 p-3 text-xs text-rose-100">
                        GPS: {gpsError}
                      </div>
                    ) : null}
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-[11px] text-slate-300">
                      推奨ブラウザは <span className="text-cyan-200">iPhone Safari</span>{" "}
                      です。iPhone版Chromeでも多くは動きますが、方位センサー許可の確認はSafari基準で行う方が安定します。
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-slate-950/92 px-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "map", label: "地図", icon: MapPinned },
                  { key: "tasks", label: "タスク", icon: Route },
                  { key: "ai", label: "AI", icon: Bot },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setMobileTab(tab.key)}
                      className={`rounded-2xl px-3 py-2 text-xs font-medium ${
                        mobileTab === tab.key
                          ? "bg-cyan-500 text-slate-950"
                          : "bg-white/5 text-slate-300"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <Icon className="h-4 w-4" />
                        <span>{tab.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

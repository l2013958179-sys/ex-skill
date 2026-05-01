const TIME_ZONE = "Asia/Shanghai";

const WEEKDAY_LABELS = {
  Mon: "星期一",
  Tue: "星期二",
  Wed: "星期三",
  Thu: "星期四",
  Fri: "星期五",
  Sat: "星期六",
  Sun: "星期日",
};

function getDateParts(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function getPeriodInfo(hour) {
  if (hour >= 0 && hour < 5) {
    return {
      period: "凌晨",
      suggestion: "可以温柔提醒用户已经很晚了，先放下手机，早点睡觉休息。",
    };
  }

  if (hour >= 5 && hour < 8) {
    return {
      period: "早上",
      suggestion: "可以自然说早安，关心用户有没有睡好，提醒吃早餐。",
    };
  }

  if (hour >= 8 && hour < 11) {
    return {
      period: "上午",
      suggestion: "可以鼓励用户开始今天的安排，轻轻提醒喝水和保持节奏。",
    };
  }

  if (hour >= 11 && hour < 14) {
    return {
      period: "中午",
      suggestion: "可以提醒用户按时吃午饭，稍微休息一下，不要一直硬撑。",
    };
  }

  if (hour >= 14 && hour < 18) {
    return {
      period: "下午",
      suggestion: "可以关心用户下午状态，提醒适当休息、喝水，陪他把事情慢慢做完。",
    };
  }

  if (hour >= 18 && hour < 22) {
    return {
      period: "晚上",
      suggestion: "可以关心用户今天累不累，提醒吃晚饭、放松一下，别把自己绷太紧。",
    };
  }

  return {
    period: "深夜",
    suggestion: "可以更温柔地陪用户收尾情绪，提醒早点休息，别熬太晚。",
  };
}

export function getCurrentTimeInfo(now = new Date()) {
  const parts = getDateParts(now);
  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  const hour = Number(parts.hour || 0);
  const minute = parts.minute || "00";
  const weekday = WEEKDAY_LABELS[parts.weekday] || parts.weekday || "";
  const { period, suggestion } = getPeriodInfo(hour);
  const date = `${year}年${month}月${day}日`;
  const time = `${parts.hour || "00"}:${minute}`;

  return {
    fullDateTime: `${date} ${weekday} ${period} ${time}`,
    date,
    time,
    weekday,
    hour,
    period,
    suggestion,
  };
}

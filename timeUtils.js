const TimeUtils = (() => {
  function pad(num) { return num.toString().padStart(2, '0'); }

  function getLocalBoundaryDate(date = new Date()) {
    const d = new Date(date);
    const boundaryHour = 4;
    if (d.getHours() < boundaryHour) {
      d.setDate(d.getDate() - 1);
    }
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function getCurrentTimeObj() {
    const now = new Date();
    return {
      date: getLocalBoundaryDate(now),
      hour: now.getHours(),
      minute: now.getMinutes()
    };
  }

  function totalMinutesFromHM(hour, minute) {
    return hour * 60 + minute;
  }

  function minuteDiff(start, end) {
    let startTotal = totalMinutesFromHM(start.hour, start.minute);
    let endTotal = totalMinutesFromHM(end.hour, end.minute);
    if (end.date !== start.date) {
      endTotal += 24 * 60; 
    }
    return Math.max(0, endTotal - startTotal);
  }

  function formatHM(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${pad(h)}:${pad(m)}`;
  }

  return { getLocalBoundaryDate, getCurrentTimeObj, minuteDiff, formatHM };
})();

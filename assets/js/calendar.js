import { api } from "./api.js?v=20261006-inline-links-steppers";
import { Feature } from "./feature.js?v=20261006-inline-links-steppers";
import {
  ENABLE_CALENDAR_MODULE,
  state,
  $,
  els,
  escapeHtml,
} from "./context.js?v=20261006-inline-links-steppers";

export class Calendar extends Feature {
  constructor(services) {
    super(services);
  }

  startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  unescapeIcs(value = "") {
    return value
      .replace(/\\n/gi, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\");
  }

  parseIcsDate(value, params = "") {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const allDay = /VALUE=DATE/i.test(params) || /^\d{8}$/.test(raw);
    const match = raw.match(
      /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/,
    );
    if (!match) return null;
    const [, y, m, d, hh = "00", mm = "00", ss = "00", z] = match;
    const date = z
      ? new Date(Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss))
      : new Date(+y, +m - 1, +d, +hh, +mm, +ss);
    return { date, allDay };
  }

  parseRRule(value = "") {
    return Object.fromEntries(
      String(value)
        .split(";")
        .map((part) => {
          const i = part.indexOf("=");
          return i > 0
            ? [part.slice(0, i).toUpperCase(), part.slice(i + 1)]
            : [part.toUpperCase(), ""];
        }),
    );
  }

  monthDiff(a, b) {
    return (
      (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth()
    );
  }

  matchesRecurrence(date, start, rule) {
    const freq = rule.FREQ;
    const interval = Math.max(1, Number(rule.INTERVAL) || 1);
    const days = Math.round(
      (this.startOfDay(date) - this.startOfDay(start)) / 86400000,
    );
    if (days < 0) return false;
    if (freq === "DAILY" && days % interval !== 0) return false;
    if (freq === "WEEKLY" && Math.floor(days / 7) % interval !== 0)
      return false;
    if (freq === "MONTHLY" && this.monthDiff(start, date) % interval !== 0)
      return false;
    if (
      freq === "YEARLY" &&
      (date.getFullYear() - start.getFullYear()) % interval !== 0
    )
      return false;
    if (!freq) return false;
    const byDay = rule.BYDAY?.split(",").map((d) => d.replace(/^[-+]?\d+/, ""));
    if (byDay?.length) {
      const names = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
      if (!byDay.includes(names[date.getDay()])) return false;
    } else if (freq === "WEEKLY" && date.getDay() !== start.getDay())
      return false;
    const byMonth = rule.BYMONTH?.split(",").map(Number);
    if (byMonth?.length && !byMonth.includes(date.getMonth() + 1)) return false;
    const byMonthDay = rule.BYMONTHDAY?.split(",").map(Number);
    if (byMonthDay?.length && !byMonthDay.includes(date.getDate()))
      return false;
    if (
      !byMonthDay?.length &&
      freq === "MONTHLY" &&
      date.getDate() !== start.getDate()
    )
      return false;
    if (
      !byMonth?.length &&
      freq === "YEARLY" &&
      date.getMonth() !== start.getMonth()
    )
      return false;
    if (
      !byMonthDay?.length &&
      freq === "YEARLY" &&
      date.getDate() !== start.getDate()
    )
      return false;
    return true;
  }

  parseIcsEvents(content) {
    if (!content) return [];
    const unfolded = String(content)
      .replace(/\r?\n[ \t]/g, "")
      .split(/\r?\n/);
    const events = [];
    let current = null;
    for (const line of unfolded) {
      if (line === "BEGIN:VEVENT") {
        current = {};
        continue;
      }
      if (line === "END:VEVENT") {
        if (current?.DTSTART) events.push(current);
        current = null;
        continue;
      }
      if (!current) continue;
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const left = line.slice(0, colon),
        value = line.slice(colon + 1);
      const [name, ...paramBits] = left.split(";");
      const key = name.toUpperCase();
      if (
        [
          "DTSTART",
          "DTEND",
          "SUMMARY",
          "DESCRIPTION",
          "LOCATION",
          "RRULE",
          "UID",
        ].includes(key)
      ) {
        current[key] = value;
        current[`${key}_PARAMS`] = paramBits.join(";");
      }
    }
    return events;
  }

  expandCalendarEvents(content, windowStart, windowEnd) {
    const result = new Map();
    const add = (date, event, allDay, suffix = "") => {
      const day = this.startOfDay(date);
      if (day < windowStart || day >= windowEnd) return;
      const key = this.dateKey(day);
      if (!result.has(key)) result.set(key, []);
      result.get(key).push({
        summary: this.unescapeIcs(event.SUMMARY || "Untitled event") + suffix,
        description: this.unescapeIcs(event.DESCRIPTION || ""),
        location: this.unescapeIcs(event.LOCATION || ""),
        allDay,
        time: allDay
          ? ""
          : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      });
    };
    for (const event of this.parseIcsEvents(content)) {
      const start = this.parseIcsDate(event.DTSTART, event.DTSTART_PARAMS);
      if (!start) continue;
      const end = this.parseIcsDate(event.DTEND, event.DTEND_PARAMS);
      const duration = end ? Math.max(0, end.date - start.date) : 0;
      const allDaySpan =
        start.allDay && end
          ? Math.max(
              0,
              Math.round(
                (this.startOfDay(end.date) - this.startOfDay(start.date)) /
                  86400000,
              ) - 1,
            )
          : 0;
      const rule = event.RRULE ? this.parseRRule(event.RRULE) : null;
      const until = rule?.UNTIL ? this.parseIcsDate(rule.UNTIL)?.date : null;
      let occurrenceCount = 0;
      // Start at DTSTART so recurrence counts and endings from before the visible window stay correct.
      for (
        let day = this.startOfDay(start.date);
        day < windowEnd;
        day = this.addDays(day, 1)
      ) {
        if (until && day > until) break;
        if (rule && !this.matchesRecurrence(day, start.date, rule)) continue;
        if (rule?.COUNT && ++occurrenceCount > Number(rule.COUNT)) break;
        const occurrenceStart = new Date(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          start.date.getHours(),
          start.date.getMinutes(),
          start.date.getSeconds(),
        );
        // ICS all-day DTEND is exclusive: show the final occupied day.
        const occurrenceEnd = start.allDay
          ? this.addDays(day, allDaySpan)
          : new Date(occurrenceStart.getTime() + duration);
        const multipleDays =
          this.dateKey(occurrenceStart) !== this.dateKey(occurrenceEnd);
        add(
          occurrenceStart,
          event,
          start.allDay,
          multipleDays ? " - Begins" : "",
        );
        if (multipleDays) add(occurrenceEnd, event, start.allDay, " - Ends");
        if (!rule) break;
      }
    }
    for (const items of result.values())
      items.sort(
        (a, b) =>
          (a.time || "").localeCompare(b.time || "") ||
          a.summary.localeCompare(b.summary),
      );
    return result;
  }

  calendarWeekStart(reference = new Date()) {
    const day = this.startOfDay(reference);
    return this.addDays(day, -day.getDay());
  }

  renderCalendarSettings() {
    const enabled = ENABLE_CALENDAR_MODULE;
    const section = $("#calendarSettings")?.closest(".settings-section");
    if (section) section.hidden = !enabled;
    if (!enabled) return;
    const exists = !!state.calendar?.exists;
    els.calendarFileRow.hidden = !exists;
    els.calendarUploadRow.hidden = exists;
    els.calendarFileName.textContent =
      state.calendar?.fileName || "calendar.ics";
    els.calendarFileStatus.textContent =
      exists && state.calendar?.updatedAt
        ? `Loaded · ${new Date(state.calendar.updatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
        : "Calendar loaded";
  }

  calendarDefaultDayWidth() {
    if (window.matchMedia("(max-width: 900px)").matches) return 128;
    if (window.matchMedia("(max-width: 1180px)").matches) return 122;
    return 132;
  }

  calendarFillDayCount() {
    const width =
      els.calendarRanges?.clientWidth || els.calendarModule?.clientWidth || 0;
    const dayWidth = this.calendarDefaultDayWidth();
    const gap = 10;
    if (!width) return 1;
    return Math.max(1, Math.ceil((width + gap) / (dayWidth + gap)));
  }

  calendarDayMarkup(date, items, today) {
    const dense =
      items.length >= 5 ? " is-dense" : items.length >= 3 ? " is-compact" : "";
    const listClass = items.length > 3 ? " calendar-event-list--scroll" : "";
    const todayClass =
      this.dateKey(date) === this.dateKey(today) ? " is-today" : "";
    const past = this.startOfDay(date) < this.startOfDay(today);
    return `<article class="calendar-day${dense}${todayClass}${past ? " is-past" : ""}"><div class="calendar-date"><strong>${date.getDate()}</strong><span>${date.toLocaleDateString("en-AU", { weekday: "short" })}</span></div><div class="calendar-event-list${listClass}">${items.map((item) => `<div class="calendar-event${past ? " is-past" : ""}" tabindex="0" data-tooltip="${escapeHtml(item.summary)}"${item.description ? ` data-tooltip-description="${escapeHtml(item.description)}"` : ""}><span class="calendar-event-title">${escapeHtml(item.summary)}</span>${item.time ? `<span class="calendar-event-time">${escapeHtml(item.time)}</span>` : ""}</div>`).join("")}</div></article>`;
  }

  renderCalendar() {
    if (!ENABLE_CALENDAR_MODULE || !this.services.tabs.current.calendar) {
      els.calendarModule.hidden = true;
      return;
    }
    if (!state.calendar?.exists) {
      els.calendarModule.hidden = true;
      els.calendarRanges.innerHTML = "";
      return;
    }

    els.calendarModule.hidden = false;
    const today = this.startOfDay(new Date());
    const week0 = this.calendarWeekStart(today);
    const fourWeekEnd = this.addDays(week0, 28);
    const content = state.calendar?.content || "";
    const defaultEvents = this.expandCalendarEvents(
      content,
      week0,
      fourWeekEnd,
    );
    const defaultEventDays = [...defaultEvents.keys()].sort();
    const fillDayCount = this.calendarFillDayCount();
    const shouldExtend = defaultEventDays.length < fillDayCount;

    let html = "";

    if (!shouldExtend) {
      const ranges = [
        { label: "This Week", start: 0, days: 7 },
        { label: "Next Week", start: 7, days: 7 },
        { label: "Upcoming", start: 14, days: 14 },
      ];
      html = ranges
        .map((range) => {
          const dayEntries = [];
          for (let i = 0; i < range.days; i++) {
            const date = this.addDays(week0, range.start + i);
            const items = defaultEvents.get(this.dateKey(date)) || [];
            if (!items.length) continue;
            dayEntries.push(this.calendarDayMarkup(date, items, today));
          }
          if (!dayEntries.length) return "";
          return `<section class="calendar-range" style="--event-days:${dayEntries.length}"><div class="calendar-range-label"><span></span><strong>${range.label}</strong><span></span></div><div class="calendar-days">${dayEntries.join("")}</div></section>`;
        })
        .join("");
    } else {
      // Sparse four-week calendars keep walking forward until there are enough
      // event-days to fill the visible row at the default card width.
      let searchEnd = fourWeekEnd;
      let events = defaultEvents;
      let eventDays = defaultEventDays;
      const maxSearchEnd = this.addDays(week0, 3660); // safety ceiling: ten years
      while (eventDays.length < fillDayCount && searchEnd < maxSearchEnd) {
        searchEnd = new Date(
          Math.min(
            this.addDays(searchEnd, 56).getTime(),
            maxSearchEnd.getTime(),
          ),
        );
        events = this.expandCalendarEvents(content, week0, searchEnd);
        eventDays = [...events.keys()].sort();
      }
      const visibleKeys = eventDays.slice(0, fillDayCount);
      const groups = new Map();
      for (const key of visibleKeys) {
        const [year, month, day] = key.split("-").map(Number);
        const date = new Date(year, month - 1, day);
        const monthKey = `${year}-${String(month).padStart(2, "0")}`;
        if (!groups.has(monthKey)) groups.set(monthKey, { date, days: [] });
        groups.get(monthKey).days.push({ date, items: events.get(key) || [] });
      }
      html = [...groups.values()]
        .map((group) => {
          const label = group.date.toLocaleDateString("en-AU", {
            month: "long",
            year: "numeric",
          });
          const dayEntries = group.days.map(({ date, items }) =>
            this.calendarDayMarkup(date, items, today),
          );
          return `<section class="calendar-range calendar-range--month" style="--event-days:${dayEntries.length}"><div class="calendar-range-label"><span></span><strong>${escapeHtml(label)}</strong><span></span></div><div class="calendar-days">${dayEntries.join("")}</div></section>`;
        })
        .join("");
    }

    els.calendarRanges.innerHTML = html;
    els.calendarRanges.classList.toggle(
      "is-month-mode",
      shouldExtend && !!html,
    );
    els.calendarEmpty.hidden = !!html || !state.calendar?.exists;
  }

  bindEvents() {
    if (ENABLE_CALENDAR_MODULE) {
      els.calendarUploadButton.addEventListener("click", () =>
        els.calendarFileInput.click(),
      );
      els.calendarFileInput.addEventListener("change", async () => {
        const file = els.calendarFileInput.files?.[0];
        els.calendarFileInput.value = "";
        if (!file) return;
        els.calendarUploadButton.disabled = true;
        try {
          state.calendar = await api.uploadCalendar(file);
          this.renderCalendar();
          this.renderCalendarSettings();
          this.services.application.toast("Calendar uploaded");
        } catch (error) {
          this.services.application.toast(error.message, "error");
        } finally {
          els.calendarUploadButton.disabled = false;
        }
      });
      els.calendarDeleteButton.addEventListener("click", async () => {
        els.calendarDeleteButton.disabled = true;
        try {
          state.calendar = await api.deleteCalendar();
          this.renderCalendar();
          this.renderCalendarSettings();
          this.services.application.toast("Calendar removed");
        } catch (error) {
          this.services.application.toast(error.message, "error");
        } finally {
          els.calendarDeleteButton.disabled = false;
        }
      });
    }
    $("#submissionModal").addEventListener("cancel", (event) =>
      event.preventDefault(),
    );
    $("#submissionCancel").addEventListener("click", () => {
      if (!state.activeUploadController) return;
      state.activeUploadCanceled = true;
      state.activeUploadController.abort();
      $("#submissionMessage").textContent = "Canceling...";
      $("#submissionCancel").disabled = true;
    });
    this.services.application.setupStickyNavbar();
    (() => {
      const ranges = els.calendarRanges;
      let pan = null;
      ranges.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button,a,input"))
          return;
        pan = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          scroll: ranges.scrollLeft,
          moved: false,
        };
      });
      ranges.addEventListener("pointermove", (event) => {
        if (!pan || event.pointerId !== pan.id) return;
        const dx = event.clientX - pan.x,
          dy = event.clientY - pan.y;
        if (!pan.moved) {
          if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) {
            pan = null;
            return;
          }
          if (Math.abs(dx) < 5) return;
          pan.moved = true;
          ranges.setPointerCapture(event.pointerId);
          ranges.classList.add("is-panning");
        }
        event.preventDefault();
        ranges.scrollLeft = pan.scroll - dx;
      });
      const end = (event) => {
        if (!pan || event.pointerId !== pan.id) return;
        pan = null;
        ranges.classList.remove("is-panning");
        if (ranges.hasPointerCapture(event.pointerId))
          ranges.releasePointerCapture(event.pointerId);
      };
      ranges.addEventListener("pointerup", end);
      ranges.addEventListener("pointercancel", end);
      ranges.addEventListener("lostpointercapture", end);
      ranges.addEventListener("pointerleave", (event) => {
        if (pan && !pan.moved) end(event);
      });
    })();
  }
}

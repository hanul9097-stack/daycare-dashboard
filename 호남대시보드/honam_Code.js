// ─── 호남본부 통합요양 대시보드 ───────────────────────────────────────────────

const WORK_PLAN_IDS = [
  // TODO: 이흥덕 업무계획 스프레드시트 ID를 여기에 추가하세요
  // 예: '1aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890abcdef'
];

const MEMBER_SS_MAP = {};

// 시트 탭 이름 → 표시 이름 (탭에 직책이 붙어있는 경우 대비)
const NAME_MAP = {
  '이흥덕[호남본부_통합요양파트]': '이흥덕',
  '이흥덕[호남본부_통합요양]':     '이흥덕',
  '김소형(김제점 센터장)':         '김소형',
  '김소형(김제점센터장)':          '김소형',
  '윤연임 (여수점센터장)':         '윤연임',
  '윤연임(여수점센터장)':          '윤연임',
  '윤연임(여수방문점 센터장)':     '윤연임',
  '정혜인(광주봄날점센터장)':      '정혜인',
  '정혜인(광주봄날점 센터장)':     '정혜인',
  '정혜인(광주 병설 봄날점 센터장)': '정혜인',
  '김미란[호남센터 센터장]':       '김미란',
  '김미란[호남센터센터장]':        '김미란',
  '김미란[광주 호남점 센터장]':    '김미란',
  '임현숙[군산점]팀장':            '임현숙',
  '임현숙[군산점] 팀장':           '임현숙',
  '임현숙(군산 병설 방문점 센터장)': '임현숙',
  '임현숙(군산병설방문점 센터장)':  '임현숙',
  '임현숙(군산센터장)':            '임현숙',
};
const MEMBER_NAMES  = ['이흥덕', '김소형', '윤연임', '정혜인', '김미란', '임현숙'];

// 연장근무도 업무계획과 같은 스프레드시트(연장근무_입력 탭)를 사용
const OVERTIME_ID = WORK_PLAN_IDS[0];

const SLACK_TOKEN = PropertiesService.getScriptProperties().getProperty('SLACK_TOKEN');
const SLACK_CHANNEL_LEADER  = 'C07V8TEHPT9';  // 01_호남본부_주간_요양_리더채널
const SLACK_CHANNEL_MANAGER = 'C0B834BD9H6';  // 01_호남본부_매니져방

const CAATS_API_KEY  = PropertiesService.getScriptProperties().getProperty('CAATS_API_KEY');
const CAATS_API_BASE = 'https://cms-api.caring.co.kr';

const HOLIDAYS = new Set([
  '2026-01-01','2026-01-28','2026-01-29','2026-01-30',
  '2026-03-01','2026-05-05','2026-05-24','2026-05-25',
  '2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26',
  '2026-10-03','2026-10-09','2026-12-25',
]);

const CENTER_ORDER_HONAM = [
  '광주 병설 봄날점', '광주 호남점', '여수방문점', '군산 병설 방문점', '김제점'
];

// 호남 센터 → call_log group_code 별칭 (실제 값 확인 후 수정)
const DEPT_ALIAS = {
  '광주 병설 봄날점': ['봄날센터', '광주봄날'],
  '광주 호남점':     ['호남센터', '광주호남'],
  '여수방문점':      ['여수센터'],
  '군산 병설 방문점': ['군산센터'],
  '김제점':         ['김제센터'],
};

// 호남 센터 담당 지점장 Slack User ID
const CENTER_MANAGER_IDS = {
  '광주 병설 봄날점': 'U08PGHM83L7',  // 정혜인
  '광주 호남점':     'U069PFYBLG7',  // 김미란(호남센터 센터장)
  '여수방문점':      'U0822MC1N68',  // 윤연임
  '군산 병설 방문점': 'U09A6SS0P62',  // 임현숙
  '김제점':         'U07KDSE5ZMK',  // 김소형
};
const CENTER_MANAGER_NAMES = {
  '광주 병설 봄날점': '정혜인',
  '광주 호남점':     '김미란',
  '여수방문점':      '윤연임',
  '군산 병설 방문점': '임현숙',
  '김제점':         '김소형',
};

// ─── 공통 유틸 ───────────────────────────────────────────────────────────────

function isHoliday(date) {
  const key = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return HOLIDAYS.has(key);
}

function getNextWeekday(date) {
  const d = new Date(date);
  do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6 || isHoliday(d));
  return d;
}

function jsonResponse(data) {
  const json = typeof data === 'string' ? data : JSON.stringify(data);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function withCache(key, ttl, fn) {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get(key);
  if (cached) return jsonResponse(cached);
  try {
    const result = JSON.stringify(fn());
    try { cache.put(key, result, ttl); } catch(e) {}
    return jsonResponse(result);
  } catch(err) {
    return jsonResponse({ error: err.message });
  }
}

function normalizeKey(s) {
  return String(s).replace(/[\s\n\r]+/g, '');
}

// ─── doGet 라우팅 ─────────────────────────────────────────────────────────────

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';

  if (!action) {
    const template = HtmlService.createTemplateFromFile('dashboard');
    template.baseUrl = ScriptApp.getService().getUrl();
    return template.evaluate()
      .setTitle('호남본부 업무 대시보드')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const today = new Date();
  const tz    = Session.getScriptTimeZone();

  if (action === 'members') {
    const dateKey = Utilities.formatDate(today, tz, 'yyyyMMddHHmm').slice(0, 11);
    return withCache('hn_members_' + dateKey, 180, () => ({
      date:    Utilities.formatDate(today, tz, 'yyyy-MM-dd'),
      members: getMembersWork(today)
    }));
  }
  if (action === 'overtime') return withCache('hn_overtime', 300, () => getOvertimeData());
  if (action === 'slack')    return withCache('hn_slack',    180, () => getSlackMessages());
  if (action === 'recruit')  return withCache('hn_recruit',  600, () => getRecruitData());
  if (action === 'otApprove') return otApproveResponse(e.parameter.id);

  if (action === 'debugOvertime')    return debugOvertimeResponse();
  if (action === 'debugWork')        return debugContentResponse();
  if (action === 'debugCaats')       return debugCaatsResponse();
  if (action === 'debugService')     return debugServiceResponse(e.parameter.id);
  if (action === 'debugDifficulty')  return debugDifficultyResponse(e.parameter.id);

  return jsonResponse({ error: 'unknown action' });
}

// ─── 업무계획 ─────────────────────────────────────────────────────────────────

// ─── 업무계획 입력 탭 생성 (Slack 워크플로우 연동용, 1회 실행) ───
function createWorkflowInputSheet() {
  if (!WORK_PLAN_IDS.length) { Logger.log('WORK_PLAN_IDS가 비어있습니다. 먼저 채워주세요.'); return; }
  const ss = SpreadsheetApp.openById(WORK_PLAN_IDS[0]);
  let sheet = ss.getSheetByName('업무계획_입력');
  if (!sheet) sheet = ss.insertSheet('업무계획_입력', 0);
  else { ss.setActiveSheet(sheet); ss.moveActiveSheet(1); }
  sheet.clear();
  sheet.getRange('A1:C1').setValues([['담당자', '업무날짜', '업무내용']])
       .setFontWeight('bold').setBackground('#a5d6a7').setHorizontalAlignment('center');
  sheet.setColumnWidth(1, 100); sheet.setColumnWidth(2, 120); sheet.setColumnWidth(3, 560);
  sheet.setFrozenRows(1);
  Logger.log('✅ "업무계획_입력" 탭 생성 완료.');
  Logger.log('Slack 워크플로우 "스프레드시트 행 추가" 단계에서 이 탭을 대상으로, 열을 A=담당자 / B=업무날짜 / C=업무내용 으로 매핑하세요.');
}

// ─── 업무계획 읽기 (업무계획_입력 탭 기반) ───
function getMembersWork(today) {
  const tz          = Session.getScriptTimeZone();
  const tomorrow    = getNextWeekday(today);
  const todayStr    = Utilities.formatDate(today,    tz, 'yyyy-MM-dd');
  const tomorrowStr = Utilities.formatDate(tomorrow, tz, 'yyyy-MM-dd');
  const result = {};
  MEMBER_NAMES.forEach(n => result[n] = { name: n, todayWork: '', tomorrowWork: '' });

  function normDate(v) {
    if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    const s = String(v).trim();
    const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    return s;
  }

  for (const ssId of WORK_PLAN_IDS) {
    try {
      const ss    = SpreadsheetApp.openById(ssId);
      const sheet = ss.getSheetByName('업무계획_입력');
      if (!sheet || sheet.getLastRow() < 2) continue;
      const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
      // 위에서 아래로 적용 → 같은 담당자·날짜 재입력 시 나중(최신) 행이 덮어씀
      rows.forEach(r => {
        const name    = NAME_MAP[String(r[0]).trim()] || String(r[0]).trim();
        if (!result[name]) return;
        const content = String(r[2] || '').trim();
        if (!content) return;
        const dStr = normDate(r[1]);
        if      (dStr === todayStr)    result[name].todayWork    = content;
        else if (dStr === tomorrowStr) result[name].tomorrowWork = content;
      });
    } catch(e) {}
  }
  return Object.values(result);
}

function getTodayWork(sheet, today) {
  const data   = sheet.getDataRange().getValues();
  const todayY = today.getFullYear();
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();

  const ymHeaders = [];
  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      const cellStr = String(data[r][c]).trim();
      const ym1 = cellStr.match(/^(\d{4})\s*[.년]\s*(\d{1,2})/);
      if (ym1) { ymHeaders.push({ row: r, year: +ym1[1], month: +ym1[2] }); break; }
      const ym2 = cellStr.match(/^(\d{1,2})월(?:\s*(달력|계획|일정))?$/);
      if (ym2) { ymHeaders.push({ row: r, year: todayY, month: +ym2[1] }); break; }
    }
  }

  function getYM(row) {
    let last = null;
    for (const h of ymHeaders) {
      if (h.row <= row) last = h; else break;
    }
    if (last) return last;
    for (const h of ymHeaders) { if (h.row > row) return h; }
    return null;
  }

  let sectionYear = null;
  for (let r = 0; r < data.length; r++) {
    if (data[r][0] instanceof Date) {
      const restEmpty = data[r].slice(1).every(v => v === '' || v === null || v === undefined);
      if (restEmpty) { sectionYear = data[r][0].getFullYear(); continue; }
    }
    for (let c = 0; c < data[r].length; c++) {
      const cell = data[r][c];
      let cellDate = null;
      if (cell instanceof Date) {
        cellDate = cell;
      } else if (typeof cell === 'number' && cell >= 1 && cell <= 31) {
        const ym = getYM(r);
        if (ym) cellDate = new Date(ym.year, ym.month - 1, cell);
      } else if (cell) {
        const md = String(cell).trim().match(/^(\d{1,2})\/(\d{1,2})$/);
        if (md) cellDate = new Date(todayY, +md[1] - 1, +md[2]);
      }
      if (cellDate) {
        const cM = cellDate.getMonth() + 1, cD = cellDate.getDate(), cY = cellDate.getFullYear();
        const isToday = cM === todayM && cD === todayD && (cY === todayY || sectionYear === todayY);
        if (isToday) {
          let workRow = -1;
          for (let sr = r; sr < Math.min(r + 7, data.length); sr++) {
            for (let sc = 0; sc < data[sr].length; sc++) {
              if (normalizeKey(String(data[sr][sc])) === '업무내용') { workRow = sr; break; }
            }
            if (workRow !== -1) break;
          }
          const startRow = (workRow !== -1) ? workRow : r + 1;
          const lines = [];
          for (let nr = startRow; nr < Math.min(r + 20, data.length); nr++) {
            if (data[nr][c] instanceof Date) break;
            if (typeof data[nr][c] === 'number' && data[nr][c] >= 1 && data[nr][c] <= 31) break;
            if (c > 0 && String(data[nr][c - 1] ?? '').trim() === '방문예약') continue;
            const v = String(data[nr][c] ?? '').trim();
            if (!v) continue;
            if (/^\d{1,2}:\d{2}/.test(v)) continue;
            lines.push(v);
          }
          if (lines.length > 0) return lines.join('\n');
        }
      }
    }
  }
  return '';
}

// ─── 연장근무 ─────────────────────────────────────────────────────────────────

// ─── 연장근무: 승인 DM/링크용 웹앱 URL + 날짜 변환 ───
const WEBAPP_URL = 'https://script.google.com/a/macros/caring.co.kr/s/AKfycbwd_7QEADb_TQhSgrfG88uRvCImMls-feHGKRIsAfImcyjDwiw0z7c4-DzLQ-EEFikD4g/exec';

function otFmtDate(v) {
  if (v === '' || v == null) return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (typeof v === 'number') return Utilities.formatDate(new Date(Math.round((v - 25569) * 86400000)), 'GMT', 'yyyy-MM-dd');
  const m = String(v).trim().match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : String(v).trim();
}

// ─── 연장근무 입력 탭 생성 (1회 실행) ───
// 열: A센터 B담당자 C신청일 D시간대 E연장시간 F사유 G승인한시간 H승인 I신청ID J승인자
function createOvertimeInputSheet() {
  if (!WORK_PLAN_IDS.length) { Logger.log('WORK_PLAN_IDS가 비어있습니다.'); return; }
  const ss = SpreadsheetApp.openById(WORK_PLAN_IDS[0]);
  let sheet = ss.getSheetByName('연장근무_입력');
  if (!sheet) sheet = ss.insertSheet('연장근무_입력', 1);
  sheet.clear();
  sheet.getRange(1, 1, sheet.getMaxRows(), 10).clearDataValidations();
  const headers = ['센터', '담당자', '연장근로신청일', '근로시간대', '연장근로시간', '신청사유', '승인한시간', '승인', '신청ID', '승인자'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
       .setFontWeight('bold').setBackground('#a5d6a7').setHorizontalAlignment('center');
  [140, 90, 120, 110, 100, 280, 130, 60, 40, 110].forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  sheet.hideColumns(9);
  sheet.setFrozenRows(1);
  const maxR = sheet.getMaxRows();
  if (maxR > 50) sheet.deleteRows(51, maxR - 50);
  Logger.log('✅ "연장근무_입력" 탭(10열) 생성. 워크플로우 매핑 A~F. 신청은 2행부터 쌓임.');
}

// ─── 새 신청 처리: 체크박스 부여 + 날짜정리 + 지점장 승인 DM (onChange 트리거) ───
function onOvertimeChange() {
  try {
    const ss = SpreadsheetApp.openById(WORK_PLAN_IDS[0]);
    const sheet = ss.getSheetByName('연장근무_입력');
    if (!sheet) return;
    const last = sheet.getLastRow();
    if (last < 2) return;
    sheet.getRange(2, 8, last - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    const data = sheet.getRange(2, 1, last - 1, 10).getValues();
    for (let i = 0; i < data.length; i++) {
      const r = data[i], row = i + 2;
      const name = String(r[1] || '').trim(), center = String(r[0] || '').trim(), id = String(r[8] || '').trim();
      if (!name || id) continue;
      const niceDate = otFmtDate(r[2]);
      if (niceDate && niceDate !== String(r[2])) sheet.getRange(row, 3).setValue(niceDate);
      const newId = Utilities.getUuid();
      sheet.getRange(row, 9).setValue(newId);
      sendOvertimeApprovalDM(center, name, r, newId);
    }
  } catch (e) {}
}

// ─── 담당 지점장에게 승인 요청 DM (승인 링크 포함) ───
function sendOvertimeApprovalDM(center, name, r, id) {
  try {
    const mgr = CENTER_MANAGER_IDS[center]; if (!mgr) return;
    const op = UrlFetchApp.fetch('https://slack.com/api/conversations.open', { method: 'post', headers: { Authorization: 'Bearer ' + SLACK_TOKEN }, payload: { users: mgr }, muteHttpExceptions: true });
    const ch = (JSON.parse(op.getContentText()).channel || {}).id; if (!ch) return;
    const date = otFmtDate(r[2]);
    const url = WEBAPP_URL + '?action=otApprove&id=' + id;
    const txt = '🕐 *연장근무 승인 요청*\n*센터:* ' + center + '\n*담당자:* ' + name + '\n*일자:* ' + date + '   *시간대:* ' + (r[3] || '') + ' (' + (r[4] || '') + ')\n*사유:* ' + (r[5] || '') + '\n\n👉 <' + url + '|✅ 승인하기>';
    UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', { method: 'post', headers: { Authorization: 'Bearer ' + SLACK_TOKEN, 'Content-Type': 'application/json' }, payload: JSON.stringify({ channel: ch, text: txt }), muteHttpExceptions: true });
  } catch (e) {}
}

// ─── 승인 체크 시 승인한시간·승인자 자동 기록 (onEdit 트리거) ───
function onOvertimeEdit(e) {
  try {
    const sh = e.range.getSheet();
    if (sh.getName() !== '연장근무_입력') return;
    if (e.range.getColumn() !== 8) return;
    const row = e.range.getRow();
    if (row < 2) return;
    const stamp = sh.getRange(row, 7);
    if (e.range.getValue() === true) {
      if (!stamp.getValue()) stamp.setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
      const who = (e.user && e.user.getEmail && e.user.getEmail()) || '';
      if (who) sh.getRange(row, 10).setValue(who);
    } else { stamp.clearContent(); sh.getRange(row, 10).clearContent(); }
  } catch (err) {}
}

// ─── 승인 트리거 설치 (1회 실행) ───
function installOvertimeApprovalTrigger() {
  if (!WORK_PLAN_IDS.length) { Logger.log('WORK_PLAN_IDS가 비어있습니다.'); return; }
  const ss = SpreadsheetApp.openById(WORK_PLAN_IDS[0]);
  ScriptApp.getProjectTriggers()
    .filter(t => ['onOvertimeEdit', 'onOvertimeChange'].includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onOvertimeEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('onOvertimeChange').forSpreadsheet(ss).onChange().create();
  Logger.log('✅ 트리거 설치: onEdit + onChange');
}

// ─── 연장근무 읽기 (연장근무_입력 탭 기반) ───
function getOvertimeData() {
  try {
    const ss = SpreadsheetApp.openById(OVERTIME_ID);
    const sheet = ss.getSheetByName('연장근무_입력');
    if (!sheet || sheet.getLastRow() < 2) return { rows: [] };
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
    const rows = [];
    data.forEach(r => {
      const name = String(r[1] || '').trim();
      if (!name) return;
      const d = otFmtDate(r[2]);
      rows.push({
        _sheetName: String(r[0] || '').trim() || '기타',
        '담당자': name, '연장근로신청일': d,
        '근로시간대': String(r[3] || '').trim(), '연장근로시간': String(r[4] || '').trim(),
        '신청사유': String(r[5] || '').trim(), '승인한시간': otFmtDate(r[6]),
        '승인자': String(r[9] || '').trim(), id: String(r[8] || '').trim(),
        '취소여부': '', '월': d ? d.substring(0, 7) : ''
      });
    });
    return { rows };
  } catch (e) { return { rows: [], error: e.message }; }
}

// ─── DM 링크 승인 처리 (doGet?action=otApprove&id=...) ───
function otApproveResponse(id) {
  try {
    if (!id) return otHtml('잘못된 요청', '', '', true);
    const sheet = SpreadsheetApp.openById(OVERTIME_ID).getSheetByName('연장근무_입력');
    const last = sheet.getLastRow(); if (last < 2) return otHtml('신청을 찾을 수 없음', '', '', true);
    const data = sheet.getRange(2, 1, last - 1, 10).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][8]).trim() === String(id).trim()) {
        const row = i + 2, center = String(data[i][0] || '').trim(), name = String(data[i][1] || '').trim();
        if (data[i][6]) return otHtml('이미 승인된 신청입니다', name, center, true);
        sheet.getRange(row, 7).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
        sheet.getRange(row, 8).setValue(true);
        sheet.getRange(row, 10).setValue(CENTER_MANAGER_NAMES[center] || (center + ' 지점장'));
        try { CacheService.getScriptCache().remove('hn_overtime'); } catch (e) {}
        return otHtml('✅ 승인 완료되었습니다', name, center, false);
      }
    }
    return otHtml('신청을 찾을 수 없습니다 (이미 처리/삭제)', '', '', true);
  } catch (e) { return otHtml('오류: ' + e.message, '', '', true); }
}

function otHtml(msg, name, center, already) {
  return HtmlService.createHtmlOutput('<div style="font-family:sans-serif;text-align:center;padding:48px 24px;"><div style="font-size:44px;">' + (already ? '☑️' : '✅') + '</div><h2 style="margin:12px 0;">' + msg + '</h2>' + (name ? ('<p style="color:#555;">' + center + ' · ' + name + ' 연장근무</p>') : '') + '<p style="color:#999;font-size:13px;">이 창은 닫으셔도 됩니다.</p></div>');
}

// ─── 대시보드 승인 버튼 처리 (google.script.run) ───
function clientApproveOvertime(id, approverName) {
  try {
    const sheet = SpreadsheetApp.openById(OVERTIME_ID).getSheetByName('연장근무_입력');
    const last = sheet.getLastRow(); if (last < 2) return { ok: false, error: 'no data' };
    const data = sheet.getRange(2, 1, last - 1, 10).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][8]).trim() === String(id).trim()) {
        const row = i + 2;
        sheet.getRange(row, 7).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
        sheet.getRange(row, 8).setValue(true);
        sheet.getRange(row, 10).setValue(approverName || '대시보드 승인');
        try { CacheService.getScriptCache().remove('hn_overtime'); } catch (e) {}
        return { ok: true };
      }
    }
    return { ok: false, error: 'not found' };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ─── Slack (두 채널) ──────────────────────────────────────────────────────────

function fetchSlackChannel(channelId) {
  try {
    const authRes = UrlFetchApp.fetch('https://slack.com/api/auth.test', {
      headers: { 'Authorization': 'Bearer ' + SLACK_TOKEN }, muteHttpExceptions: true
    });
    const wsUrl = JSON.parse(authRes.getContentText()).url || '';
    let allMessages = [], cursor = '';
    do {
      let url = 'https://slack.com/api/conversations.history?channel=' + channelId + '&limit=200';
      if (cursor) url += '&cursor=' + encodeURIComponent(cursor);
      const res  = UrlFetchApp.fetch(url, { headers: { 'Authorization': 'Bearer ' + SLACK_TOKEN }, muteHttpExceptions: true });
      const data = JSON.parse(res.getContentText());
      if (!data.ok) return { messages: [], error: data.error };
      allMessages = allMessages.concat(data.messages || []);
      cursor = (data.response_metadata && data.response_metadata.next_cursor) || '';
    } while (cursor);
    return {
      messages: allMessages
        .filter(m => m.type === 'message' && !m.subtype)
        .map(m => ({
          text:       m.text || '',
          ts:         m.ts,
          replyCount: m.reply_count || 0,
          done:       (m.reactions || []).some(r =>
            r.name === 'white_check_mark' || r.name === 'heavy_check_mark' || r.name === '완료'
          ),
          permalink: wsUrl + 'archives/' + channelId + '/p' + m.ts.replace('.', '')
        }))
    };
  } catch(e) { return { messages: [], error: e.message }; }
}

function getSlackMessages() {
  return {
    leader:  fetchSlackChannel(SLACK_CHANNEL_LEADER),
    manager: fetchSlackChannel(SLACK_CHANNEL_MANAGER),
  };
}

// ─── CAATS 인증 ───────────────────────────────────────────────────────────────

function getCaatsToken() {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get('caats_token_hn');
  if (cached) return cached;
  const props = PropertiesService.getScriptProperties();
  const res = UrlFetchApp.fetch(CAATS_API_BASE + '/members/sign-in', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': CAATS_API_KEY },
    payload: JSON.stringify({ loginId: props.getProperty('CAATS_ID'), password: props.getProperty('CAATS_PW') }),
    muteHttpExceptions: true
  });
  const allHeaders = res.getAllHeaders();
  let token = '';
  for (const key of Object.keys(allHeaders)) {
    if (key.toLowerCase() === 'authorization') { token = allHeaders[key]; break; }
  }
  if (!token) {
    try { const b = JSON.parse(res.getContentText()); token = b.data?.accessToken ? ('Bearer ' + b.data.accessToken) : ''; } catch(e) {}
  }
  if (token) cache.put('caats_token_hn', token, 300);
  return token;
}

// ─── 구인 난이도 ──────────────────────────────────────────────────────────────

function parseCohabitantCount(remark) {
  if (!remark || !remark.trim()) return 1;
  const parts = remark.split(/[,，]/);
  let total = 0;
  parts.forEach(part => {
    const nm = part.match(/(\d+)\s*(?:명|인|분)/);
    total += nm ? parseInt(nm[1]) : 1;
  });
  return total || 1;
}

function calcDifficulty(svc, wageHourly, marketWage) {
  let p = 0;
  const times   = svc.times || [];
  const healths = svc.recipientHealths || [];

  if (marketWage && wageHourly) {
    const gap = marketWage - wageHourly;
    if (gap >= 1500) p += 2; else if (gap > 0) p++;
  }
  if (times.some(t => (t.days||[]).some(d => d==='SATURDAY'||d==='SUNDAY'))) p++;
  if (times.some(t => parseInt(t.serviceStartTime||'800') < 800 || parseInt(t.serviceEndTime||'1800') > 2000)) p++;
  if (svc.cognitiveDeclineYn) p++;
  if (healths.some(h => h.recipientHealthCd==='BOWEL_MOVEMENT'||h.recipientHealthCd==='UROLOGY')) p++;
  const beh = healths.find(h => h.recipientHealthCd==='BEHAVIOR');
  if (beh) {
    const d = beh.recipientHealthDetails || [];
    if (d.some(x => x==='WHEELCHAIR'||x==='LYING'||x==='UNABLE'||x==='BEDRIDDEN')) p += 2;
    else if (d.some(x => x==='HELPING')) p++;
  }
  if (svc.cohabitantExistenceYn) {
    const cnt = parseCohabitantCount(svc.cohabitantRemark || '');
    if (cnt === 1) p += 0.5; else if (cnt >= 3) p += 1.5; else p += 1;
  }
  if ((svc.weight||0) >= 70) p++;
  if (svc.longTermGradeCd==='FIRST_GRADE'||svc.longTermGradeCd==='SECOND_GRADE') p++;
  if (svc.recruitTypeCd==='RE_RECRUIT'||svc.recruitTypeCd==='EMERGENCY_RECRUIT') p++;
  if (svc.genderCd === 'MALE') p += 0.5;
  if (svc.petHaveYn) p += 0.5;
  const remark = (svc.recruitRemark||'') + (svc.insideShareDesc||'');
  if (/어려|힘들|문제|민원|갈등|까다|거부|기피/.test(remark)) p++;

  return p<=1?1:p<=4?2:p<=7?3:p<=10?4:5;
}

// ─── 구인 데이터 ──────────────────────────────────────────────────────────────

function getRecruitData() {
  try {
    const token = getCaatsToken();
    if (!token) return { rows: [], error: '로그인 실패 (토큰 없음)' };

    const res  = UrlFetchApp.fetch(CAATS_API_BASE + '/v2/recruits?order=CREATED_DESC&page=1&size=200', {
      headers: { 'Authorization': token, 'X-Api-Key': CAATS_API_KEY }, muteHttpExceptions: true
    });
    const data = JSON.parse(res.getContentText());
    if (String(data.code) !== '200') return { rows: [], error: data.message || JSON.stringify(data) };

    const content       = data.data?.content || [];
    const ACTIVE_STATES = new Set(['WAIT','CALL_DONE','SEARCH','INTERVIEW','COMPLETE']);
    const activeItems   = content.filter(r => ACTIVE_STATES.has(r.recruitStateCd));

    const cache  = CacheService.getScriptCache();
    const svcMap = {};
    const toFetch = [];
    activeItems.forEach(r => {
      const cv = cache.get('svc_' + r.recruitId);
      if (cv) { try { svcMap[r.recruitId] = JSON.parse(cv); } catch(e) {} }
      else toFetch.push(r);
    });
    if (toFetch.length > 0) {
      UrlFetchApp.fetchAll(toFetch.map(r => ({
        url:     CAATS_API_BASE + '/v2/recruits/' + r.recruitId + '/service',
        headers: { 'Authorization': token, 'X-Api-Key': CAATS_API_KEY },
        muteHttpExceptions: true
      }))).forEach((resp, i) => {
        try {
          const b    = JSON.parse(resp.getContentText());
          const info = b.data?.recruitInfo || {};
          const svcData = {
            wageHourly:            info.wageHourly            || null,
            cohabitantExistenceYn: info.cohabitantExistenceYn || false,
            cohabitantRemark:      info.cohabitantRemark      || '',
            cognitiveDeclineYn:    info.cognitiveDeclineYn    || false,
            weight:                info.weight                || 0,
            longTermGradeCd:       info.longTermGradeCd       || '',
            genderCd:              info.genderCd              || '',
            petHaveYn:             info.petHaveYn             || false,
            recruitTypeCd:         info.recruitTypeCd         || '',
            recruitRemark:         info.recruitRemark         || '',
            insideShareDesc:       info.insideShareDesc        || '',
            times:                 b.data?.times              || [],
            recipientHealths:      b.data?.recipientHealths   || []
          };
          svcMap[toFetch[i].recruitId] = svcData;
          try { cache.put('svc_' + toFetch[i].recruitId, JSON.stringify(svcData), 1800); } catch(e) {}
        } catch(e) {}
      });
    }

    // 호남 지역 시세 (케어파트너)
    const districtSet = new Map();
    activeItems.forEach(r => {
      const dk = parseDistrictKey(r.districtNm || '');
      if (dk.city && dk.gu) {
        const key = dk.city + '_' + dk.gu;
        if (!districtSet.has(key)) districtSet.set(key, dk);
      }
    });
    const marketWageMap = getCarePartnerWages([...districtSet.values()]);

    const autoDiffMap = {};
    activeItems.forEach(r => {
      const svc = svcMap[r.recruitId];
      if (!svc) return;
      const dk = parseDistrictKey(r.districtNm || '');
      const mw = marketWageMap[dk.city+'_'+dk.gu] || null;
      autoDiffMap[r.recruitId] = calcDifficulty(svc, svc.wageHourly, mw);
      svc.marketWage  = mw;
      svc.recipientNm = r.recipientNm || '';
      try { cache.put('svc_' + r.recruitId, JSON.stringify(svc), 1800); } catch(e) {}
    });

    // 문자 발송 수
    const smsMap     = {};
    const smsToFetch = [];
    activeItems.forEach(r => {
      const cv = cache.get('sms_' + r.recruitId);
      if (cv !== null) { smsMap[r.recruitId] = parseInt(cv) || 0; }
      else smsToFetch.push(r);
    });
    if (smsToFetch.length > 0) {
      UrlFetchApp.fetchAll(smsToFetch.map(r => ({
        url:     CAATS_API_BASE + '/v2/recruits/' + r.recruitId + '/jobseekers?sendStateCds=COMPLETE&page=1&size=1',
        headers: { 'Authorization': token, 'X-Api-Key': CAATS_API_KEY },
        muteHttpExceptions: true
      }))).forEach((resp, i) => {
        try {
          const b   = JSON.parse(resp.getContentText());
          const cnt = b.data?.totalElements ?? b.data?.content?.[0]?.totalCnt ?? 0;
          smsMap[smsToFetch[i].recruitId] = cnt;
          try { cache.put('sms_' + smsToFetch[i].recruitId, String(cnt), 300); } catch(e) {}
        } catch(e) { smsMap[smsToFetch[i].recruitId] = 0; }
      });
    }

    const GRADE_NUM = { FIRST_GRADE:1, SECOND_GRADE:2, THIRD_GRADE:3, FOURTH_GRADE:4, FIFTH_GRADE:5 };
    return {
      rows: content.map(r => {
        const dk  = parseDistrictKey(r.districtNm || '');
        const svc = svcMap[r.recruitId] || {};
        const dongM = (r.districtDesc || r.districtNm || '').match(/([가-힣]{2,5}동)/);
        return {
          recruitId:      r.recruitId,
          createDt:       r.recruitCreateDt       ? r.recruitCreateDt.substring(0,10)       : '',
          stateChangeDt:  r.recruitStateChangeDt  ? r.recruitStateChangeDt.substring(0,10)  : '',
          state:          r.recruitStateCd,
          type:           r.recruitTypeCd,
          recipientNm:    r.recipientNm,
          district:       r.districtNm,
          districtDesc:   r.districtDesc,
          serviceType:    r.serviceTypeCd,
          department:     r.recruitDepartmentNm,
          wageHourly:     svc.wageHourly || null,
          marketWage:     marketWageMap[dk.city+'_'+dk.gu] || null,
          autoDifficulty: autoDiffMap[r.recruitId] || null,
          grade:          GRADE_NUM[svc.longTermGradeCd] || null,
          dong:           dongM ? dongM[1] : '',
          gender:         svc.genderCd || '',
          smsSentCount:   smsMap[r.recruitId] || 0
        };
      })
    };
  } catch(e) { return { rows: [], error: e.message }; }
}

// ─── 지역 시세 ────────────────────────────────────────────────────────────────

function parseDistrictKey(districtNm) {
  const parts = (districtNm || '').split(' ');
  if (parts.length < 2) return { city: '', gu: '' };
  const city = parts[0].replace(/특별시$|광역시$|특별자치시$|특별자치도$/, '').replace(/도$/, '');
  return { city, gu: parts[1] || '' };
}

// 호남 지역 좌표 (케어파트너 시세 조회용)
const DISTRICT_COORDS = {
  '광주_광산구': { lat: 35.1396, lng: 126.7932 },
  '광주_서구':   { lat: 35.1495, lng: 126.8526 },
  '광주_남구':   { lat: 35.1334, lng: 126.9025 },
  '광주_북구':   { lat: 35.1739, lng: 126.9117 },
  '광주_동구':   { lat: 35.1460, lng: 126.9231 },
  '전남_여수시': { lat: 34.7604, lng: 127.6622 },
  '전북_군산시': { lat: 35.9677, lng: 126.7368 },
  '전북_김제시': { lat: 35.8035, lng: 126.8807 },
};

function getCarePartnerWages(districtKeys) {
  if (!districtKeys.length) return {};
  const cache   = CacheService.getScriptCache();
  const wageMap = {}, toFetch = [];
  districtKeys.forEach(dk => {
    const mk = dk.city + '_' + dk.gu;
    const cv = cache.get('cp2_' + mk);
    if (cv) wageMap[mk] = parseInt(cv); else toFetch.push(dk);
  });
  if (!toFetch.length) return wageMap;
  const tasks = toFetch.map(dk => {
    const mk     = dk.city + '_' + dk.gu;
    const coords = DISTRICT_COORDS[mk];
    return coords ? { dk, mk, coords } : null;
  }).filter(Boolean);
  if (!tasks.length) return wageMap;
  UrlFetchApp.fetchAll(tasks.map(t => ({
    url: 'https://www.carepartner.kr/jobs?lat=' + t.coords.lat + '&lng=' + t.coords.lng
       + '&workType=all&distance=by_walk30&sort=special_and_published',
    muteHttpExceptions: true
  }))).forEach((resp, i) => {
    const { mk } = tasks[i];
    try {
      const html = resp.getContentText();
      const m    = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
      if (!m) return;
      const data = JSON.parse(m[1]);
      const jobs = (data.props?.pageProps?.sspJobPostingsResponse?.jobPostings) || [];
      const wages = [];
      jobs.forEach(j => {
        if (j.payType !== 'hourly') return;
        if (j.minWage > 10320 && j.minWage <= 14500) wages.push(j.minWage);
        if (j.maxWage > 10320 && j.maxWage <= 14500 && j.maxWage !== j.minWage) wages.push(j.maxWage);
      });
      if (wages.length >= 3) {
        const avg = Math.round(wages.reduce((a,b) => a+b, 0) / wages.length);
        try { cache.put('cp2_' + mk, String(avg), 21600); } catch(e) {}
        wageMap[mk] = avg;
      }
    } catch(e) {}
  });
  return wageMap;
}

// ─── 난이도 상세 (클릭 팝업용) ───────────────────────────────────────────────

function getDifficultyDetails(recruitId) {
  const token = getCaatsToken();
  if (!token) throw new Error('토큰 없음');
  const cache = CacheService.getScriptCache();
  let svc = null, info = {};
  const cv = cache.get('svc_' + recruitId);
  if (cv) { try { svc = JSON.parse(cv); } catch(e) {} }
  if (!svc) {
    const resp = UrlFetchApp.fetch(CAATS_API_BASE + '/v2/recruits/' + recruitId + '/service', {
      headers: { 'Authorization': token, 'X-Api-Key': CAATS_API_KEY }, muteHttpExceptions: true
    });
    const b = JSON.parse(resp.getContentText());
    info = b.data?.recruitInfo || {};
    svc  = {
      wageHourly:            info.wageHourly,
      cohabitantExistenceYn: info.cohabitantExistenceYn || false,
      cognitiveDeclineYn:    info.cognitiveDeclineYn    || false,
      weight:                info.weight                || 0,
      longTermGradeCd:       info.longTermGradeCd       || '',
      genderCd:              info.genderCd              || '',
      petHaveYn:             info.petHaveYn             || false,
      recruitTypeCd:         info.recruitTypeCd         || '',
      recruitRemark:         info.recruitRemark         || '',
      insideShareDesc:       info.insideShareDesc        || '',
      times:                 b.data?.times              || [],
      recipientHealths:      b.data?.recipientHealths   || []
    };
  }
  let marketWage  = svc.marketWage  !== undefined ? svc.marketWage  : null;
  let recipientNm = svc.recipientNm || null;
  if (marketWage === null) {
    const listRes  = UrlFetchApp.fetch(CAATS_API_BASE + '/v2/recruits?order=CREATED_DESC&page=1&size=200', {
      headers: { 'Authorization': token, 'X-Api-Key': CAATS_API_KEY }, muteHttpExceptions: true
    });
    const listData = JSON.parse(listRes.getContentText());
    const item     = (listData.data?.content || []).find(r => String(r.recruitId) === String(recruitId));
    const dk       = item ? parseDistrictKey(item.districtNm || '') : { city:'', gu:'' };
    const mwMap    = getCarePartnerWages(dk.city && dk.gu ? [dk] : []);
    marketWage  = mwMap[dk.city + '_' + dk.gu] || null;
    recipientNm = recipientNm || item?.recipientNm || null;
  }
  const reasons = [];
  let total = 0;
  if (marketWage && svc.wageHourly) {
    const gap = marketWage - svc.wageHourly;
    if (gap >= 1500) { reasons.push(`시급(${svc.wageHourly?.toLocaleString()}원) < 시세(${marketWage.toLocaleString()}원) 1,500원 이상 차이 → +2점`); total += 2; }
    else if (gap > 0) { reasons.push(`시급(${svc.wageHourly?.toLocaleString()}원) < 시세(${marketWage.toLocaleString()}원) → +1점`); total += 1; }
    else { reasons.push(`시급(${svc.wageHourly?.toLocaleString()}원) ≥ 시세(${marketWage.toLocaleString()}원) → +0점`); }
  }
  const hasWeekend = (svc.times||[]).some(t => (t.days||[]).some(d => d==='SATURDAY'||d==='SUNDAY'));
  hasWeekend ? (reasons.push('주말 근무 포함 → +1점'), total++) : reasons.push('주말 근무 없음 → +0점');
  const hasOddHours = (svc.times||[]).some(t => parseInt(t.serviceStartTime||'800') < 800 || parseInt(t.serviceEndTime||'1800') > 2000);
  hasOddHours ? (reasons.push('이른 아침(8시 전) 또는 늦은 저녁(20시 후) 근무 → +1점'), total++) : reasons.push('정상 시간대 근무 → +0점');
  svc.cognitiveDeclineYn ? (reasons.push('인지 저하(치매 등) 있음 → +1점'), total++) : reasons.push('인지 저하 없음 → +0점');
  const hasElim = (svc.recipientHealths||[]).some(h => h.recipientHealthCd==='BOWEL_MOVEMENT'||h.recipientHealthCd==='UROLOGY');
  hasElim ? (reasons.push('배변/비뇨기 문제 있음 → +1점'), total++) : reasons.push('배변/비뇨기 문제 없음 → +0점');
  const beh = (svc.recipientHealths||[]).find(h => h.recipientHealthCd==='BEHAVIOR');
  if (beh) {
    const d = beh.recipientHealthDetails || [];
    if (d.some(x => x==='WHEELCHAIR'||x==='LYING'||x==='UNABLE'||x==='BEDRIDDEN')) { reasons.push(`거동 불가(${d.join(',')}) → +2점`); total += 2; }
    else if (d.some(x => x==='HELPING')) { reasons.push(`거동 부축 필요(${d.join(',')}) → +1점`); total++; }
    else reasons.push('거동 상태 경미 → +0점');
  } else reasons.push('거동 정보 없음 → +0점');
  if (svc.cohabitantExistenceYn) {
    const cnt = parseCohabitantCount(svc.cohabitantRemark || info.cohabitantRemark || '');
    const pts = cnt===1 ? 0.5 : cnt>=3 ? 1.5 : 1;
    reasons.push(`동거인 ${cnt}명 (${svc.cohabitantRemark || info.cohabitantRemark || '내용 없음'}) → +${pts}점`);
    total += pts;
  } else reasons.push('동거인 없음 → +0점');
  (svc.weight||0) >= 70 ? (reasons.push(`체중 ${svc.weight}kg (70kg 이상) → +1점`), total++) : reasons.push(`체중 ${svc.weight||'미확인'}kg → +0점`);
  (svc.longTermGradeCd==='FIRST_GRADE'||svc.longTermGradeCd==='SECOND_GRADE') ? (reasons.push(`요양 등급 ${svc.longTermGradeCd} → +1점`), total++) : reasons.push(`요양 등급 ${svc.longTermGradeCd||'미확인'} → +0점`);
  (svc.recruitTypeCd==='RE_RECRUIT'||svc.recruitTypeCd==='EMERGENCY_RECRUIT') ? (reasons.push(`구인 유형 ${svc.recruitTypeCd} → +1점`), total++) : reasons.push(`구인 유형 ${svc.recruitTypeCd||'신규'} → +0점`);
  svc.genderCd === 'MALE' ? (reasons.push('수급자 남성 → +0.5점'), total += 0.5) : reasons.push(`수급자 ${svc.genderCd==='FEMALE'?'여성':'미확인'} → +0점`);
  (svc.petHaveYn ?? info.petHaveYn ?? false) ? (reasons.push('반려동물 있음 → +0.5점'), total += 0.5) : reasons.push('반려동물 없음 → +0점');
  const remark = (svc.recruitRemark||'') + (svc.insideShareDesc||'');
  const kw = remark.match(/어려|힘들|문제|민원|갈등|까다|거부|기피/);
  kw ? (reasons.push(`특이사항 키워드 ("${kw[0]}") 감지 → +1점`), total++) : reasons.push('특이사항 부정 키워드 없음 → +0점');
  const stars = total<=1?1:total<=4?2:total<=7?3:total<=10?4:5;
  return { recruitId, recipientNm, totalPoints: total, stars, marketWage, wageHourly: svc.wageHourly, reasons };
}

// ─── google.script.run 클라이언트 함수 ───────────────────────────────────────

function clientGetMembers() {
  const today   = new Date();
  const tz      = Session.getScriptTimeZone();
  const cache   = CacheService.getScriptCache();
  const dateKey = Utilities.formatDate(today, tz, 'yyyyMMddHHmm').slice(0, 11);
  const key     = 'hn_members_' + dateKey;
  const cv      = cache.get(key);
  if (cv) { try { return JSON.parse(cv); } catch(e) {} }
  const result = { date: Utilities.formatDate(today, tz, 'yyyy-MM-dd'), members: getMembersWork(today) };
  try { cache.put(key, JSON.stringify(result), 180); } catch(e) {}
  return result;
}

function clientGetOvertime() {
  const cache = CacheService.getScriptCache();
  const cv    = cache.get('hn_overtime');
  if (cv) { try { return JSON.parse(cv); } catch(e) {} }
  const result = getOvertimeData();
  try { cache.put('hn_overtime', JSON.stringify(result), 300); } catch(e) {}
  return result;
}

function clientGetSlack() {
  const cache = CacheService.getScriptCache();
  const cv    = cache.get('hn_slack');
  if (cv) { try { return JSON.parse(cv); } catch(e) {} }
  const result = getSlackMessages();
  try { cache.put('hn_slack', JSON.stringify(result), 180); } catch(e) {}
  return result;
}

function clientGetRecruit() {
  const cache = CacheService.getScriptCache();
  const cv    = cache.get('hn_recruit');
  if (cv) { try { return JSON.parse(cv); } catch(e) {} }
  const result = getRecruitData();
  if (result && !result.error && Array.isArray(result.rows) && result.rows.length) {
    try { cache.put('hn_recruit', JSON.stringify(result), 600); } catch(e) {}
  }
  return result;
}

function clientGetDifficulty(recruitId) {
  return getDifficultyDetails(recruitId);
}

function clientGetCallCounts() {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get('hn_call_counts');
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }
  const props   = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('CALL_DATA_SHEET_ID');
  if (!sheetId) return { ok: false, error: '시트 미설정' };
  try {
    const ss    = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('call_log');
    if (!sheet || sheet.getLastRow() < 2) return { ok: true, counts: {} };
    const tz   = 'Asia/Seoul';
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    const calls = data.filter(r => r[0]).map(r => ({
      key:    String(r[0] || ''),
      center: String(r[1] || ''),
      date:   r[2] instanceof Date ? Utilities.formatDate(r[2], tz, 'yyyy-MM-dd') : String(r[2] || '').substring(0, 10),
      isOp:   (r[3] === 1 || r[3] === '1' || r[3] === true),
    }));
    const recruitData = clientGetRecruit();
    const ACTIVE  = new Set(['WAIT','CALL_DONE','SEARCH','INTERVIEW','COMPLETE']);
    const recruits = (recruitData.rows || []).filter(r => r.serviceType === 'RECUPERATION' && ACTIVE.has(r.state));
    const token   = getCaatsToken();
    const counts  = {};
    const failed  = [];
    if (token && recruits.length) {
      const jsKeyMap = getAllJobseekerKeys(recruits, token, failed);
      recruits.forEach(r => {
        const aliases = DEPT_ALIAS[r.department] || [r.department];
        const since   = String(r.createDt || '');
        const jsKeys  = jsKeyMap[r.recruitId] || new Set();
        const matched = new Set();
        calls.forEach(c => {
          if (c.isOp) return;
          if (c.date < since) return;
          if (!aliases.some(a => c.center.indexOf(a) !== -1)) return;
          if (jsKeys.has(c.key)) matched.add(c.key);
        });
        counts[r.recruitId] = matched.size;
      });
    }
    const result = { ok: true, counts };
    if (!failed.length) { try { cache.put('hn_call_counts', JSON.stringify(result), 600); } catch(e) {} }
    return result;
  } catch(e) { return { ok: false, error: e.message }; }
}

function fetchJobseekerKeys(rid, token) {
  function keysFromContent(content) {
    const ks = [];
    (content || []).forEach(j => {
      const raw = String(j.mainPhoneNo || '').replace(/[^0-9]/g, '');
      if (raw.length >= 7) ks.push(raw.substring(0, 3) + '-' + raw.slice(-4));
    });
    return ks;
  }
  let keys = [], page = 1, total = null;
  while (page <= 15) {
    const url = CAATS_API_BASE + '/v2/recruits/' + rid + '/jobseekers?sendStateCds=COMPLETE&page=' + page + '&size=200';
    let data  = null;
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      try {
        const resp = UrlFetchApp.fetch(url, { headers: { 'Authorization': token, 'X-Api-Key': CAATS_API_KEY }, muteHttpExceptions: true });
        if (resp.getResponseCode() === 200) data = JSON.parse(resp.getContentText());
        else Utilities.sleep(300);
      } catch(e) { Utilities.sleep(300); }
    }
    if (!data) return { keys: null };
    const content = data.data?.content || [];
    keys = keys.concat(keysFromContent(content));
    if (total === null) total = data.data?.totalElements ?? content.length;
    if (!content.length || page * 200 >= total) break;
    page++;
  }
  return { keys };
}

function getAllJobseekerKeys(recruits, token, failedOut) {
  const cache  = CacheService.getScriptCache();
  const result = {};
  recruits.forEach(r => {
    const ck = 'jsk_' + r.recruitId;
    const c  = cache.get(ck);
    if (c) { try { result[r.recruitId] = new Set(JSON.parse(c)); return; } catch(e) {} }
    const out = fetchJobseekerKeys(r.recruitId, token);
    if (out.keys === null) {
      result[r.recruitId] = new Set();
      if (failedOut) failedOut.push(r.recruitId);
    } else {
      result[r.recruitId] = new Set(out.keys);
      try { cache.put(ck, JSON.stringify(out.keys), 1800); } catch(e) {}
    }
  });
  return result;
}

// ─── 자동화 트리거 ────────────────────────────────────────────────────────────

/* 금요일 9시 구인현황 Slack 발송 */
function sendWeeklyRecruitReport() {
  try {
    const data = getRecruitData();
    const rows = (data.rows || []).filter(r => r.serviceType === 'RECUPERATION');
    const ACTIVE     = new Set(['WAIT','CALL_DONE','SEARCH','INTERVIEW']);
    const activeRows = rows.filter(r => ACTIVE.has(r.state));
    const today      = new Date();
    const month      = today.getMonth() + 1;
    const weekOfMonth = Math.ceil(today.getDate() / 7);
    const byCenter   = {};
    activeRows.forEach(r => { const c = r.department || '기타'; if (!byCenter[c]) byCenter[c] = []; byCenter[c].push(r); });
    const orderedCenters = [...CENTER_ORDER_HONAM.filter(c => byCenter[c]), ...Object.keys(byCenter).filter(c => !CENTER_ORDER_HONAM.includes(c)).sort()];
    const overdue = activeRows.map(r => {
      const dt = r.createDt ? new Date(r.createDt) : null;
      return { ...r, days: dt ? Math.floor((today - dt) / 86400000) : 0 };
    }).filter(r => r.days > 7);
    const centerDelayCount = {};
    overdue.forEach(r => { const c = r.department || '기타'; centerDelayCount[c] = (centerDelayCount[c]||0) + 1; });
    const centerLines = orderedCenters.map(c => {
      const total   = byCenter[c].length;
      const delayed = centerDelayCount[c] || 0;
      return `• ${c} : ${total}건${delayed > 0 ? ` (지연 ${delayed}건)` : ''}`;
    }).join('\n');
    const message = `${month}월 ${weekOfMonth}주차 구인진행중인 현황 공유드립니다.(일반요양만 해당)\n\n${centerLines}`;
    UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + SLACK_TOKEN, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ channel: SLACK_CHANNEL_LEADER, text: message }),
      muteHttpExceptions: true
    });
  } catch(e) { Logger.log('슬랙 발송 오류: ' + e.message); }
}

function checkAndSendWeeklyReport() {
  const now  = new Date(), tz = Session.getScriptTimeZone();
  const day  = parseInt(Utilities.formatDate(now, tz, 'u'));
  const hour = parseInt(Utilities.formatDate(now, tz, 'H'));
  const min  = parseInt(Utilities.formatDate(now, tz, 'm'));
  if (day !== 5 || hour !== 9 || min >= 10) return;
  const props    = PropertiesService.getScriptProperties();
  const todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  if (props.getProperty('hn_weeklyReportLastSent') === todayStr) return;
  sendWeeklyRecruitReport();
  props.setProperty('hn_weeklyReportLastSent', todayStr);
}

/* 평일 9시 구인 지연 알림 */
function sendDelayedRecruitAlert() {
  try {
    const data = getRecruitData();
    const rows = (data.rows || []).filter(r => r.serviceType === 'RECUPERATION');
    const ACTIVE       = new Set(['WAIT','CALL_DONE','SEARCH','INTERVIEW']);
    const STATE_LABELS = { WAIT:'대기', CALL_DONE:'통화완료', SEARCH:'구인중', INTERVIEW:'면접중' };
    const now          = new Date();
    const todayStart   = new Date(now); todayStart.setHours(0,0,0,0);
    const overdueByCenter = {};
    rows.forEach(r => {
      if (!ACTIVE.has(r.state)) return;
      const dt = r.createDt ? new Date(r.createDt) : null;
      if (!dt) return;
      dt.setHours(0,0,0,0);
      const daysSince = Math.floor((todayStart - dt) / 86400000);
      if (daysSince <= 7) return;
      const dept = r.department || '기타';
      if (!overdueByCenter[dept]) overdueByCenter[dept] = [];
      overdueByCenter[dept].push({ ...r, daysSince });
    });
    if (!Object.keys(overdueByCenter).length) return;
    const orderedCenters = [...CENTER_ORDER_HONAM.filter(c => overdueByCenter[c]), ...Object.keys(overdueByCenter).filter(c => !CENTER_ORDER_HONAM.includes(c)).sort()];
    const parts = ['📋 *구인 지연 현황 알림* (D+7 초과 · 일반요양)', ''];
    orderedCenters.forEach(dept => {
      const items   = overdueByCenter[dept].sort((a,b) => b.daysSince - a.daysSince);
      const mid     = CENTER_MANAGER_IDS[dept];
      const mention = mid ? ` <@${mid}>` : '';
      parts.push(`*🏢 ${dept}*${mention} — ${items.length}건 지연 중`);
      items.forEach(r => {
        const stateLabel = STATE_LABELS[r.state] || r.state || '-';
        parts.push(`• ${r.recipientNm || '-'}  D+${r.daysSince}  (${stateLabel})${r.daysSince === 8 ? '  🆕 오늘 신규 지연' : ''}`);
      });
      parts.push('');
    });
    UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + SLACK_TOKEN, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ channel: SLACK_CHANNEL_LEADER, text: parts.join('\n') }),
      muteHttpExceptions: true
    });
  } catch(e) { Logger.log('지연 구인 알림 오류: ' + e.message); }
}

function checkAndSendDelayAlert() {
  const now  = new Date(), tz = Session.getScriptTimeZone();
  const day  = parseInt(Utilities.formatDate(now, tz, 'u'));
  const hour = parseInt(Utilities.formatDate(now, tz, 'H'));
  const min  = parseInt(Utilities.formatDate(now, tz, 'm'));
  if (day < 1 || day > 5 || hour !== 9 || min >= 10) return;
  const props    = PropertiesService.getScriptProperties();
  const todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  if (props.getProperty('hn_delayAlertLastSent') === todayStr) return;
  sendDelayedRecruitAlert();
  props.setProperty('hn_delayAlertLastSent', todayStr);
}

function setupTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => ['checkAndSendWeeklyReport','checkAndSendDelayAlert'].includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkAndSendWeeklyReport').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('checkAndSendDelayAlert').timeBased().everyMinutes(5).create();
  Logger.log('트리거 설정 완료');
}

// ─── 디버그 ───────────────────────────────────────────────────────────────────

function debugOvertimeResponse() {
  try {
    const ss = SpreadsheetApp.openById(OVERTIME_ID);
    const result = ss.getSheets().map(sheet => {
      const data = sheet.getDataRange().getValues();
      let headerRowIdx = -1, headerRow = [];
      for (let r = 0; r < Math.min(10, data.length); r++) {
        if (data[r].some(c => normalizeKey(String(c)) === '담당자')) { headerRowIdx = r; headerRow = data[r].map(h => normalizeKey(String(h))); break; }
      }
      const rowCount = headerRowIdx >= 0 ? data.slice(headerRowIdx + 1).filter(r => r[headerRow.indexOf('담당자')]).length : 0;
      return { sheetName: sheet.getName(), headerFound: headerRowIdx >= 0, rowCount };
    });
    return ContentService.createTextOutput(JSON.stringify(result, null, 2)).setMimeType(ContentService.MimeType.JSON);
  } catch(e) { return jsonResponse({ error: e.message }); }
}

function debugContentResponse() {
  const today = new Date(), result = {};
  for (const ssId of WORK_PLAN_IDS) {
    try {
      const ss = SpreadsheetApp.openById(ssId);
      for (const sheet of ss.getSheets()) {
        const rawName = sheet.getName(), name = NAME_MAP[rawName] || rawName;
        if (!MEMBER_NAMES.includes(name)) continue;
        result[name + ' / ' + rawName] = getTodayWork(sheet, today) || '(없음)';
      }
    } catch(e) { result['error'] = e.message; }
  }
  return ContentService.createTextOutput(JSON.stringify(result, null, 2)).setMimeType(ContentService.MimeType.JSON);
}

function debugCaatsResponse() {
  try {
    const token    = getCaatsToken();
    if (!token) return jsonResponse({ error: '토큰 없음' });
    const listRes  = UrlFetchApp.fetch(CAATS_API_BASE + '/v2/recruits?order=CREATED_DESC&page=1&size=10', { headers: { 'Authorization': token, 'X-Api-Key': CAATS_API_KEY }, muteHttpExceptions: true });
    const listData = JSON.parse(listRes.getContentText());
    const ACTIVE   = new Set(['WAIT','CALL_DONE','SEARCH','INTERVIEW']);
    const item     = (listData.data?.content||[]).find(r => ACTIVE.has(r.recruitStateCd));
    if (!item) return jsonResponse({ error: '활성 구인건 없음' });
    const svcRes  = UrlFetchApp.fetch(CAATS_API_BASE + '/v2/recruits/' + item.recruitId + '/service', { headers: { 'Authorization': token, 'X-Api-Key': CAATS_API_KEY }, muteHttpExceptions: true });
    return ContentService.createTextOutput(JSON.stringify({ recruitId: item.recruitId, raw: JSON.parse(svcRes.getContentText()) }, null, 2)).setMimeType(ContentService.MimeType.JSON);
  } catch(e) { return jsonResponse({ error: e.message }); }
}

function debugServiceResponse(recruitId) {
  try {
    const token = getCaatsToken();
    if (!token) return jsonResponse({ error: '토큰 없음' });
    const resp  = UrlFetchApp.fetch(CAATS_API_BASE + '/v2/recruits/' + recruitId + '/service', { headers: { 'Authorization': token, 'X-Api-Key': CAATS_API_KEY }, muteHttpExceptions: true });
    return ContentService.createTextOutput(JSON.stringify(JSON.parse(resp.getContentText()), null, 2)).setMimeType(ContentService.MimeType.JSON);
  } catch(e) { return jsonResponse({ error: e.message }); }
}

function debugDifficultyResponse(recruitId) {
  try {
    return ContentService.createTextOutput(JSON.stringify(getDifficultyDetails(recruitId), null, 2)).setMimeType(ContentService.MimeType.JSON);
  } catch(e) { return jsonResponse({ error: e.message }); }
}

function clearCache() {
  CacheService.getScriptCache().removeAll(['hn_recruit','hn_overtime','hn_members','hn_slack','hn_call_counts']);
}

function testSlack() { Logger.log(JSON.stringify(getSlackMessages())); }

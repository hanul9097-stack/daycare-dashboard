/**
 * 호남본부 업무계획 구글 시트 자동 생성 스크립트
 * Apps Script 편집기에서 createWorkPlanSheets() 를 한 번만 실행하세요.
 */

const HONAM_MEMBERS = ['이흥덕', '김소형', '윤연임', '정혜인', '김미란', '임현숙'];

function createWorkPlanSheets() {
  const ss   = SpreadsheetApp.create('호남본부_업무계획');
  const ssId = ss.getId();
  const tz   = ss.getSpreadsheetTimeZone() || 'Asia/Seoul';

  // 기본으로 생성되는 "시트1" 삭제 (멤버 탭 추가 후)
  const defaultSheet = ss.getSheets()[0];

  HONAM_MEMBERS.forEach(name => {
    const sheet = ss.insertSheet(name);
    buildMonthlyTemplate(sheet, name, tz);
  });

  // 기본 시트 삭제
  ss.deleteSheet(defaultSheet);

  Logger.log('========================================');
  Logger.log('✅ 업무계획 시트 생성 완료!');
  Logger.log('스프레드시트 ID: ' + ssId);
  Logger.log('URL: https://docs.google.com/spreadsheets/d/' + ssId);
  Logger.log('');
  Logger.log('honam_Code.js 의 WORK_PLAN_IDS 에 아래 ID를 추가하세요:');
  Logger.log("'" + ssId + "'");
  Logger.log('========================================');

  // 결과를 스프레드시트 첫 탭에도 기록
  const infoSheet = ss.insertSheet('📋 안내');
  ss.setActiveSheet(infoSheet);
  ss.moveActiveSheet(1);
  infoSheet.getRange('A1').setValue('스프레드시트 ID').setFontWeight('bold');
  infoSheet.getRange('B1').setValue(ssId);
  infoSheet.getRange('A2').setValue('URL').setFontWeight('bold');
  infoSheet.getRange('B2').setValue('https://docs.google.com/spreadsheets/d/' + ssId);
  infoSheet.getRange('A3').setValue('생성일').setFontWeight('bold');
  infoSheet.getRange('B3').setValue(Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'));
  infoSheet.getRange('A1:B3').setBackground('#e8f5e9');
  infoSheet.autoResizeColumns(1, 2);
}

function buildMonthlyTemplate(sheet, memberName, tz) {
  const today = new Date();
  const year  = today.getFullYear();
  const month = today.getMonth() + 1;

  // ── 색상 팔레트 ──
  const COLOR_HEADER  = '#2e7d32';
  const COLOR_WEEKEND = '#fce4ec';
  const COLOR_TODAY   = '#e8f5e9';
  const COLOR_DATE_BG = '#f1f8e9';

  // 열 너비 설정 (A: 날짜, B: 구분, C: 업무내용)
  sheet.setColumnWidth(1, 70);   // A: 날짜
  sheet.setColumnWidth(2, 70);   // B: 구분
  sheet.setColumnWidth(3, 500);  // C: 업무내용

  // ── 1행: 년월 헤더 ──
  const headerRange = sheet.getRange('A1:C1');
  headerRange.merge();
  headerRange.setValue(year + '년 ' + month + '월 업무계획');
  headerRange.setBackground(COLOR_HEADER).setFontColor('#ffffff')
             .setFontSize(13).setFontWeight('bold').setHorizontalAlignment('center');
  sheet.setRowHeight(1, 36);

  // ── 2행: 컬럼 제목 ──
  sheet.getRange('A2').setValue('날짜');
  sheet.getRange('B2').setValue('구분');
  sheet.getRange('C2').setValue('업무내용');
  sheet.getRange('A2:C2').setBackground('#a5d6a7').setFontWeight('bold')
       .setHorizontalAlignment('center').setBorder(true,true,true,true,true,true);
  sheet.setRowHeight(2, 28);

  // ── 3행~: 날짜별 행 ──
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNames    = ['일','월','화','수','목','금','토'];
  const todayDate   = today.getDate();
  let row = 3;

  for (let d = 1; d <= daysInMonth; d++) {
    const date   = new Date(year, month - 1, d);
    const dow    = date.getDay(); // 0=일 6=토
    const isWeekend = (dow === 0 || dow === 6);
    const isToday   = (d === todayDate);
    const dateLabel = month + '/' + d + '(' + dayNames[dow] + ')';

    // 날짜 셀 (A열)
    const dateCell = sheet.getRange(row, 1);
    dateCell.setValue(dateLabel);
    dateCell.setHorizontalAlignment('center').setFontSize(10);
    if (isWeekend) dateCell.setBackground(COLOR_WEEKEND).setFontColor('#c62828');
    else if (isToday) dateCell.setBackground(COLOR_TODAY).setFontWeight('bold');
    else dateCell.setBackground(COLOR_DATE_BG);

    // 구분 셀 (B열) — "업무내용" 레이블
    const labelCell = sheet.getRange(row, 2);
    labelCell.setValue('업무내용');
    labelCell.setFontSize(9).setFontColor('#888888').setHorizontalAlignment('center');
    if (isWeekend) labelCell.setBackground(COLOR_WEEKEND);
    else if (isToday) labelCell.setBackground(COLOR_TODAY);
    else labelCell.setBackground(COLOR_DATE_BG);

    // 업무내용 셀 (C열)
    const contentCell = sheet.getRange(row, 3);
    contentCell.setBackground('#ffffff');
    contentCell.setWrap(true).setVerticalAlignment('top');
    if (isWeekend) contentCell.setBackground('#fff9f9');
    else if (isToday) contentCell.setBackground('#f9fff9');

    // 행 높이
    sheet.setRowHeight(row, 80);

    // 테두리
    sheet.getRange(row, 1, 1, 3).setBorder(
      true, true, true, true, true, true,
      '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID
    );

    row++;
  }

  // 멤버 이름을 시트 맨 위에 메모로 추가
  sheet.getRange('A1').setNote('담당자: ' + memberName);

  // 열 고정 (1~2행 고정)
  sheet.setFrozenRows(2);
}

/**
 * 다음 달 시트를 추가하고 싶을 때 실행
 * (매달 초에 실행하면 됩니다)
 */
function addNextMonthSheets() {
  // TODO: WORK_PLAN_IDS 에서 스프레드시트 ID를 가져와 실행
  const ssId = '여기에_스프레드시트_ID_입력';
  const ss   = SpreadsheetApp.openById(ssId);
  const tz   = ss.getSpreadsheetTimeZone() || 'Asia/Seoul';

  const today    = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const year  = nextMonth.getFullYear();
  const month = nextMonth.getMonth() + 1;

  HONAM_MEMBERS.forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    // 기존 내용 지우고 새 달 템플릿으로 교체
    sheet.clear();
    buildMonthlyTemplate(sheet, name, tz);
    Logger.log(name + ' ' + year + '년 ' + month + '월 시트 업데이트 완료');
  });
}

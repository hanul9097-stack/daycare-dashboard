# 호남본부 업무 대시보드

호남본부 통합요양 파트의 업무 현황을 한 화면에서 보는 Google Apps Script 웹앱.

## 구성

| 파일 | GAS 배치 | 설명 |
|------|----------|------|
| `honam_Code.js` | `Code.gs` | 백엔드 — 라우팅, 업무계획 시트 파싱, 연장근무, Slack 2채널, CAATS 구인/난이도/시세, 콜카운트, 주간·지연 자동알림 |
| `honam_dashboard.html` | `dashboard` (HTML) | 프런트엔드 — 4개 탭(업무계획·구인현황·이슈/To-Do·연장근무) + 요약·센터별 연장근무 패널 |
| `honam_setup.js` | `setup` | `createWorkPlanSheets()` — 팀원별 월간 업무계획 시트 자동 생성 |
| `honam_preview.html` | (로컬 전용) | mock 데이터로 디자인/레이아웃을 미리보는 단독 HTML (서버·인터넷 불필요) |
| `호남대시보드_설정가이드.txt` | — | 배포·설정 안내 |

## 팀원 / 센터

- 팀원 6명: 이흥덕 · 김소형 · 윤연임 · 정혜인 · 김미란 · 임현숙
- 센터 5곳: 광주 병설 봄날점 · 광주 호남점 · 여수방문점 · 군산 병설 방문점 · 김제점

## 배포 (요약)

1. script.google.com 새 프로젝트 → 위 3개 파일 추가 (`Code.gs`, `dashboard` HTML, `setup`)
2. `setup`의 `createWorkPlanSheets()` 실행 → 생성된 스프레드시트 ID를 `WORK_PLAN_IDS`에 입력
3. `OVERTIME_ID` 입력
4. **스크립트 속성** 설정 (아래 보안 항목 참고)
5. 배포 → 새 배포 → 웹 앱 → URL 생성

## 보안 — 스크립트 속성 (코드에 비밀키를 넣지 않음)

다음 값은 코드가 아니라 Apps Script **프로젝트 설정 → 스크립트 속성**에 등록합니다:

| 속성 이름 | 용도 |
|-----------|------|
| `SLACK_TOKEN` | Slack 봇 토큰 (`xoxb-...`) |
| `CAATS_API_KEY` | CAATS API 키 |
| `CAATS_ID` / `CAATS_PW` | CAATS 로그인 계정 |
| `CALL_DATA_SHEET_ID` | 콜로그 시트 ID (콜 카운트용) |

`honam_Code.js`는 `PropertiesService.getScriptProperties().getProperty(...)`로 이 값들을 읽습니다. 비밀키는 절대 커밋하지 않습니다.

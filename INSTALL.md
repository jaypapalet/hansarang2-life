# 한사랑2차 생활정보 설치·배포 매뉴얼

## 로컬에서 실행

Node.js 24 LTS와 npm이 필요하다. 저장소를 클론했다면 최상위 폴더에서 다음 명령을 순서대로 실행한다.

```sh
npm ci
npm test
npm run build
npm start
```

[http://127.0.0.1:4189/](http://127.0.0.1:4189/)에서 주민 화면을 연다. `Ctrl+C`로 서버를 종료한다. Windows에서는 저장소의 `start.cmd`로 설치, 빌드, 실행을 한 번에 할 수 있다.

화면만 빠르게 수정할 때는 `npm run dev`를 실행하고 Vite가 표시하는 주소를 연다. 도로 API도 함께 확인하려면 다른 터미널에서 `npm run build`, `npm start`를 실행한다. Vite는 `/api` 요청을 기본 포트 4189의 로컬 Worker로 보낸다.

## 기술 스택

| 구성 | 기술과 위치 |
| --- | --- |
| 주민 화면 | `src/`의 React, TypeScript, CSS. Vite가 화면과 사진·글꼴을 `dist/client/index.html`에 묶는다. 기본 주소는 `/`이며 기존 `/resident/` 주소에서도 같은 화면을 연다. |
| 서버 | JavaScript ES 모듈로 만든 Cloudflare Worker. `build.mjs`가 화면과 서버 API를 `dist/server/index.js`에 묶는다. `local.mjs`는 Node.js에서 같은 Worker를 실행한다. |
| 호스팅 | ChatGPT Sites. 기존 프로젝트 ID는 `.openai/hosting.json`에 있다. |
| 도로 정보 | 지정 경로는 OSRM 기준 경로와 TOPIS 구간 속도를 쓴다. 목적지는 카카오맵에서 찾고 카카오모빌리티로 거리와 소요 시간을 조회한다. [도로 전광판 상세](ROADS.md) |

현재 화면에서 날씨, 지하철·버스 도착 시각, 전기차 충전 현황은 예시로 표시한다. 실제 조회가 연결된 기능은 도로 전광판과 목적지 검색이다. 로컬 서버는 실행 중 지정 경로를 10분 간격으로 갱신한다. Sites Worker는 요청을 받을 때 10분이 지난 값을 갱신한다.

## API 키 준비

로컬에서 실제 API를 쓸 때만 루트에 `.env`를 만들고 [`.env.example`](.env.example)의 이름으로 값을 설정한다. `npm start`가 시작할 때 이 파일을 읽으므로 수정 후 서버를 다시 시작한다. 운영 배포에서는 같은 변수 이름을 ChatGPT Sites의 서버 환경에 별도로 등록한다.

| 변수 | 필요한 기능 | 발급처 |
| --- | --- | --- |
| `KAKAO_MOBILITY_REST_API_KEY` | 목적지 검색과 자동차 거리·소요 시간 조회. 같은 앱에서 카카오맵 사용 설정도 켠다. | [카카오맵](https://developers.kakao.com/docs/ko/kakaomap/common) · [카카오모빌리티](https://developers.kakaomobility.com/guide/navi-api/start) |
| `TOPIS_OPEN_DATA_KEY` | 지정 경로의 교통 상황 갱신. 로컬 확인에는 공개 테스트 값 `sample`을 쓸 수 있다. | [서울 열린데이터광장 일반 인증키](https://data.seoul.go.kr/together/mypage/actkeyMain.do) |
| `DATA_GO_KR_KEY` | 서버의 날씨·특보, 버스, 전기차 충전 공식 API를 이용할 때 필요하다. | [공공데이터포털](https://www.data.go.kr/) |
| `SEOUL_SUBWAY_KEY` | 서버에서 서울시 공식 실시간 지하철 API를 이용할 때 필요하다. | [서울 열린데이터광장 실시간 지하철 인증키](https://data.seoul.go.kr/together/mypage/actkeyMain.do) |

### 에이전트가 키를 확인하고 저장하는 방법

1. 이번 작업에서 사용할 변수만 확인한다. 로컬은 dotenv 파서로 `.env`를 읽고, 운영은 `get_environment_variables`로 등록 상태를 확인한다. 변수 이름과 등록 여부만 보여준다. 빈 값은 미등록으로 보고, 운영에서 값이 가려진 비밀 항목은 등록된 것으로 본다.
2. 로컬에 필요한 키가 비어 있으면 변수마다 `request_secret`을 `delivery: "file"`로 호출한다. 카드에 키 이름, 용도, 발급처를 적는다. 반환된 파일은 저장 명령이 직접 읽도록 한다. 키를 채팅으로 받거나 명령 인자나 출력에 넣지 않는다.
3. `git check-ignore -- .env`로 Git에서 제외되는지 확인한다. 루트의 `.env`가 없으면 새로 만들고, 소유자만 읽고 쓸 수 있도록 권한을 설정한다. 저장 명령이 반환된 파일의 한 줄 값을 직접 읽어 dotenv 형식에 맞춰 기록한다. 기존 설정과 사용 중인 값은 보존하고 파서로 등록 여부를 확인한다. 받은 값은 임시 파일이나 터미널 기록에 복사하지 않는다.
4. 운영에 필요한 키가 비어 있으면 보호된 값 전달을 지원하는 환경에서만 `update_environment_variables`로 해당 항목을 추가하고 `is_secret: true`를 설정한다. 값의 안전한 전달이 불가능하면 소유자가 ChatGPT에서 해당 사이트의 **설정 → Secrets**에 직접 입력하도록 안내한다. 등록 상태를 확인한 뒤 배포를 이어간다. [Sites 환경 변수 안내](https://learn.chatgpt.com/docs/sites/managing-a-site)
5. 키를 확인할 수 없으면 영향받는 기능을 알려주고 해당 기능을 대체 데이터나 안내 상태로 게시할지 확인한다. 실제 값은 Git, 프런트엔드 번들, 호스팅 설정, 배포 아카이브, 로그에 넣지 않는다.

## 기존 ChatGPT Site에 배포

저장소 소유자는 **“Sites 배포해줘”**라고 요청하면 된다. 에이전트가 변경 확인부터 게시 결과 확인까지 진행한다. 계정 권한을 연결하거나 누락된 키를 입력해야 할 때 소유자에게 요청한다.

1. 현재 환경의 **Sites 스킬**을 읽는다. `.openai/hosting.json`의 `project_id`를 그대로 써서 `get_site`로 주소와 접근 설정을 확인하고, `create_source_repository_write_credential`로 같은 프로젝트의 소스 편집 권한을 확인한다. 기존 사이트 주소와 공개 범위를 유지한다.
2. `git status --short`로 배포할 변경을 확인한다. Sites 스킬의 `site-workflow.mjs --project-id <project_id>`로 운영 소스를 연다. GitHub와 Sites의 이력이 다르면 빈 디렉터리에서 열고, 반환된 `checkout_path`에 배포할 추가·수정·삭제를 적용한다. 양쪽에서 바뀐 파일은 비교해서 병합한다.
3. 위 절차로 이번 배포에 필요한 API 키를 확인한다. Sites 체크아웃에서 `npm ci`, `npm test`, 빌드, `git diff --check`를 실행한다. Sites 스킬의 `build-site.mjs`는 저장소의 `npm run build`를 실행한다. 빌드 후 `dist/server/index.js`가 있는지 확인한다. Worker 방식에서는 `.openai/hosting.json`의 `static` 필드를 생략한다. 아카이브에는 `dist/.openai/hosting.json`과 `dist/server/index.js`가 들어간다.
4. Sites 스킬의 소스 도우미에 `credential`, 앞서 받은 `source`, 남은 검증·빌드 `commands`, 절대 경로 `archivePath`를 스킬에 명시된 표준 입력으로 전달한다. 도우미가 운영 소스 브랜치에 변경을 푸시하고 아카이브를 만든다. 소스 접근 자격 증명은 세션에서만 다룬다. 로컬 `.env`, 키 입력 파일, 개발 환경 파일은 배포에서 제외한다.
5. 도우미가 반환한 SHA와 그 아카이브로 게시한다. 소유자만 접근하는 사이트는 `save_version_and_deploy_private`를 사용한다. 해당 도구가 없으면 `save_site_version` 다음에 `deploy_private_site_version`을 사용한다. 다른 접근 범위에서는 `save_site_version` 다음에 `deploy_site_version`을 사용한다. 버전 저장만 요청받았다면 게시 단계는 생략한다.
6. 배포가 대기·빌드·게시 중이면 `get_deployment_status`로 완료를 확인한다. 배포 주소와 새 버전의 주민 화면을 확인하고 변경된 API가 있다면 응답도 확인한다. 최종 결과에 주소, 버전 또는 SHA, 확인한 기능을 남긴다.

`Sites project not found`나 권한 오류가 나오면 프로젝트 ID와 연결된 ChatGPT 계정·워크스페이스를 확인한다. 운영 소스에 쓰기 권한이 없으면 로컬 변경을 보존하고 소유자 또는 편집 권한이 필요하다고 안내한다.

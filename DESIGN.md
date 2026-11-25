---
name: 한사랑2차 생활정보 샘플
description: 오늘 날씨와 두 역의 도착 정보를 홈에서 보여준다.
colors:
  ground: "#fdfdfc"
  ink: "#19263a"
  muted: "#4e5c6b"
  line: "#d7dfe7"
  accent: "#214c85"
  weather: "#e8eff6"
typography:
  headline:
    fontFamily: Resident Sans Preview
    fontSize: "1.8rem"
    fontWeight: 760
    lineHeight: 1.24
    letterSpacing: "-.025em"
  section:
    fontSize: "1.45rem"
    fontWeight: 740
  body:
    fontFamily: Resident Sans Preview
    fontSize: "1rem"
    lineHeight: 1.5
spacing:
  gutter: "2rem"
  gutter-mobile: "1rem"
components:
  tab-selected:
    textColor: "{colors.accent}"
    height: "3.65rem"
---

# Design System

## 화면 구성

홈에서 오늘 날씨가 본문 너비를 채운다. 기온과 예보는 왼쪽에, 단지 전경은 오른쪽에 둔다. 증미역과 등촌역은 모바일에서도 같은 폭의 두 열로 배치한다. 각 방면에서 첫 열차 도착 시간 아래에 다음 열차 시간을 작게 표시한다.

버스 도착 정보는 기본으로 후문 양방향을 보여준다. 제목 아래의 탭에서 후문과 등촌역 중앙정류장을 바꿔 볼 수 있다. 노선 번호 검색은 선택한 정류장의 양방향에 적용한다. 각 노선에서 가장 가까운 버스와 그다음 버스를 표시한다. 너비 38rem 이하에서는 도심 방향과 공항 방향을 위아래로 놓는다.

종이에 인쇄한 안내문처럼 밝은 바탕에 남색 글자와 가는 구분선을 쓴다. 날씨를 연한 파란색 면으로 묶고 선택한 상단 메뉴는 파란 밑줄로 표시한다. 기온, 도착 시간, 자동차 소요 시간은 고정폭 숫자로 표시한다.

본문 최대 너비는 68rem이다. 화면 너비 34rem 이하에서는 사이트 이름 아래에 상단 메뉴를 한 줄로 배치하고, 날씨 세부 항목은 사진 아래에서 전체 너비를 쓴다.

상단 메뉴는 오늘, 동네 소식, 단지 생활 순이다. 동네 소식 화면은 행사 일정과 구청 소식을 별도 제목으로 나눈다. 행사 일정은 달력과 목록을 오갈 수 있고, 구청 소식에서는 글 종류를 고른 뒤 제목으로 검색할 수 있다. 단지 생활에는 전기차 충전과 관리사무소 정보를 둔다.

## 도로 전광판

한사랑2차삼성아파트에서 마곡나루역, 김포공항 국내선, 여의도역, 홍대입구역까지의 지정 경로를 보여준다. 각 행에는 주행 거리와 예상 시간을, 표 아래에는 조회 시각과 출처를 표시한다.

표 아래에서 장소 이름이나 주소를 검색할 수 있다. 결과를 고르면 카카오모빌리티가 계산한 자동차 소요 시간과 주행 거리가 나타난다. 날씨와 지하철·버스 도착 시간은 예시다.

# 도로 전광판 로컬 실행

[설치·배포 매뉴얼](INSTALL.md)에 따라 서버를 실행한 뒤 [로컬 주민 페이지](http://127.0.0.1:4189/)를 연다.

- `TOPIS_OPEN_DATA_KEY`는 서울 열린데이터광장 일반 인증키다. 로컬 확인에는 공개 테스트 키 `sample`을 쓸 수 있다.
- `KAKAO_MOBILITY_REST_API_KEY`는 자동차 길찾기와 장소 검색에 쓰는 REST API 키다. 해당 카카오디벨로퍼스 앱에서 카카오맵 API의 키워드 장소 검색도 사용할 수 있어야 한다.

## 카카오 REST API 키 등록

1. 준비한 앱의 **카카오맵 → 사용 설정**에서 상태를 **ON**으로 바꾼다. [카카오맵 활성화 안내](https://developers.kakao.com/docs/ko/kakaomap/common)
2. 같은 앱의 **앱 → 플랫폼 키**에서 활성화된 **REST API 키**를 확인한다. [자동차 길찾기 시작 가이드](https://developers.kakaomobility.com/guide/navi-api/start)
3. 프로젝트 루트의 `.env`에 `KAKAO_MOBILITY_REST_API_KEY=` 뒤에 키 값을 입력하고 `npm start`로 서버를 다시 시작한다. [환경 변수 예시](.env.example)

## 지정 경로

마곡나루역, 김포공항 국내선, 여의도역, 홍대입구역까지의 OSRM 자동차 경로를 [서울시 서비스링크 보간점 2025 파일](https://data.seoul.go.kr/dataList/OA-15060/F/1/datasetView.do)과 대조했다. 공개 [TOPIS 도로 소통 API](https://data.seoul.go.kr/dataList/OA-13291/A/1/datasetView.do)에서 해당 방향의 구간 속도를 받아, 실제 경로와 겹치는 거리만으로 구간 시간을 계산한다. 맞는 구간이 없거나 속도가 빠진 곳은 OSRM의 해당 구간 기본 시간을 쓴다.

로컬 서버는 시작할 때와 조회를 마친 뒤 10분마다 갱신한다. 페이지를 보고 있는 동안에도 10분 간격으로 읽는다. Worker에서는 요청 시 10분보다 오래된 값을 갱신한다. 방문이 없는 시간에도 갱신하려면 배포 후 별도 예약 실행에서 `/api/roads/fixed`를 호출하도록 설정한다.

## 목적지 검색

카카오맵 키워드 검색으로 장소 이름을 찾는다. 사용자가 목록에서 하나를 고르면 서버가 아파트를 출발지로 [카카오모빌리티 자동차 길찾기](https://developers.kakaomobility.com/guide/navi-api/directions.html)를 한 번 호출한다. 화면에 소요 시간과 주행 거리를 바로 반환하며 응답은 `no-store`로 내려준다.

`dist/client/index.html`을 파일로 열면 저장된 OSRM 값을 확인할 수 있다. TOPIS 조회와 카카오 검색을 확인할 때는 로컬 서버 주소로 접속한다. 저장된 OSRM 값만 다시 계산하려면 `npm run update-road-times`를 실행한다.

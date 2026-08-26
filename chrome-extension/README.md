# M3 Product Browser Bridge

서버가 쇼핑커넥트/쇼핑 상품 URL을 직접 열지 못할 때 Chrome이 대신 원 링크를 열고 상품명, 가격, 이미지, 최종 URL을 M3 서버에 전달합니다.

## 설치
1. Chrome에서 `chrome://extensions` 열기
2. 개발자 모드 켜기
3. `압축해제된 확장 프로그램을 로드합니다` 선택
4. 이 `chrome-extension` 폴더 선택
5. 확장프로그램 팝업에서 M3 Railway 서버 주소 입력
6. M3에 `ADMIN_PASSWORD`가 설정되어 있으면 같은 비밀번호 입력

## 동작 순서
M3 직접 추출 → Browser Bridge → 네이버 쇼핑 검색 API → 수동 입력

확장프로그램은 약 30초마다 대기 작업을 확인합니다. 즉시 처리하려면 팝업의 `지금 브리지 실행` 버튼을 누르세요.

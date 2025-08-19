# Data Manager 시스템 아키텍처 다이어그램

## 시스템 개요
이 시스템은 비디오 트랜스코딩을 위한 데이터 관리 시스템으로, 클립 정보를 수집하고 작업을 생성하며 결과를 보고하는 역할을 합니다.

## 전체 시스템 아키텍처

```mermaid
graph TB
    subgraph "메인 프로세스"
        DM[data_manager.js<br/>메인 프로세스]
        LIS[listen.js<br/>HTTP 서버]
    end
    
    subgraph "핵심 모듈"
        JC[job_creator.js<br/>작업 생성기]
        JR[job_reporter.js<br/>작업 보고기]
        JH[job.js<br/>작업 핸들러]
    end
    
    subgraph "유틸리티 모듈"
        API[Api.js<br/>API 통신]
        DB[Dbdata.js<br/>데이터베이스]
        LOG[logger.js<br/>로깅]
        UTIL[util.js<br/>유틸리티]
    end
    
    subgraph "라우팅"
        ROUTES[routes/index.js<br/>HTTP 라우트]
    end
    
    subgraph "설정 파일"
        CONFIG[data_manager.json<br/>설정]
        PKG[package.json<br/>패키지 정보]
    end
    
    subgraph "외부 시스템"
        DB_SYS[(MySQL DB)]
        API_SYS[외부 API]
        SMS_SYS[SMS 서비스]
    end
    
    %% 메인 프로세스 연결
    DM --> JC
    DM --> JR
    DM --> JH
    LIS --> ROUTES
    
    %% 모듈 간 의존성
    JC --> API
    JC --> DB
    JC --> LOG
    JC --> UTIL
    
    JR --> API
    JR --> DB
    JR --> LOG
    JR --> UTIL
    
    JH --> API
    JH --> DB
    JH --> LOG
    JH --> UTIL
    
    ROUTES --> JH
    ROUTES --> LOG
    
    %% 설정 파일 연결
    DM --> CONFIG
    DM --> PKG
    LIS --> CONFIG
    LIS --> PKG
    
    %% 외부 시스템 연결
    DB --> DB_SYS
    API --> API_SYS
    LOG --> SMS_SYS
    
    %% 스타일링
    classDef mainProcess fill:#e1f5fe
    classDef coreModule fill:#f3e5f5
    classDef utilModule fill:#e8f5e8
    classDef config fill:#fff3e0
    classDef external fill:#ffebee
    
    class DM,LIS mainProcess
    class JC,JR,JH coreModule
    class API,DB,LOG,UTIL utilModule
    class CONFIG,PKG config
    class DB_SYS,API_SYS,SMS_SYS external
```

## 데이터 흐름 다이어그램

```mermaid
sequenceDiagram
    participant DM as Data Manager
    participant JC as Job Creator
    participant JR as Job Reporter
    participant JH as Job Handler
    participant DB as Database
    participant API as External API
    participant LOG as Logger
    
    Note over DM: 시스템 시작
    DM->>LOG: 로거 초기화
    DM->>DB: 데이터베이스 연결
    DM->>JC: 작업 생성기 시작
    DM->>JR: 작업 보고기 시작
    
    loop 작업 생성 프로세스
        JC->>DB: CP 정보 조회
        DB-->>JC: CP 목록 반환
        JC->>API: 클립 정보 요청
        API-->>JC: 클립 데이터 반환
        JC->>JH: 작업 등록
        JH->>DB: 작업 정보 저장
        JC->>LOG: 작업 생성 로그
    end
    
    loop 작업 보고 프로세스
        JR->>DB: 처리 결과 조회
        DB-->>JR: 결과 데이터 반환
        JR->>API: 결과 보고 전송
        API-->>JR: 보고 완료 확인
        JR->>LOG: 보고 완료 로그
    end
    
    Note over DM: HTTP 요청 처리
    DM->>JH: 작업 등록 요청
    JH->>DB: 작업 정보 저장
    JH-->>DM: 등록 완료 응답
```

## 모듈 상세 관계도

```mermaid
graph LR
    subgraph "Job Creator 모듈"
        JC_MAIN[clipinforeceiver_jobcreator]
        JC_EVENT[jobcreator_event_register]
        JC_SHUT[jobcreator_shutdown]
    end
    
    subgraph "Job Reporter 모듈"
        JR_MAIN[clipinforeporter]
        JR_EVENT[jobreporter_event_register]
        JR_SHUT[jobreporter_shutdown]
    end
    
    subgraph "Job Handler 모듈"
        JH_REG[regist_job_by_ftp]
        JH_CONV[convert_clip_info]
        JH_READ[read_manager_config]
    end
    
    subgraph "API 모듈"
        API_REPORT[report_and_check]
        API_SEND[send_request]
        API_SMS[smscall]
    end
    
    subgraph "Database 모듈"
        DB_CP[get_cp_info_by_index]
        DB_CONFIG[get_data_manager_config]
        DB_REPORT[get_report_date]
        DB_EVENT[register_event]
    end
    
    subgraph "Logger 모듈"
        LOG_INIT[init_logger]
        LOG_INFO[info]
        LOG_ERROR[error]
        LOG_SMS[smscall]
    end
    
    subgraph "Util 모듈"
        UTIL_CONFIG[read_config]
        UTIL_TIME[now_format]
        UTIL_HASH[dbj2_hash]
        UTIL_SMS[smscall]
    end
    
    %% Job Creator 연결
    JC_MAIN --> DB_CP
    JC_MAIN --> API_REPORT
    JC_MAIN --> JH_REG
    JC_EVENT --> JC_MAIN
    JC_SHUT --> JC_EVENT
    
    %% Job Reporter 연결
    JR_MAIN --> DB_REPORT
    JR_MAIN --> API_REPORT
    JR_EVENT --> JR_MAIN
    JR_SHUT --> JR_EVENT
    
    %% Job Handler 연결
    JH_REG --> JH_CONV
    JH_CONV --> API_SEND
    JH_READ --> DB_CONFIG
    
    %% API 연결
    API_REPORT --> API_SEND
    API_SMS --> LOG_SMS
    
    %% Database 연결
    DB_CP --> LOG_INFO
    DB_CONFIG --> LOG_INFO
    DB_REPORT --> LOG_INFO
    DB_EVENT --> LOG_INFO
    
    %% Logger 연결
    LOG_INIT --> UTIL_CONFIG
    LOG_SMS --> UTIL_SMS
    
    %% Util 연결
    UTIL_CONFIG --> LOG_ERROR
    UTIL_TIME --> LOG_INFO
    UTIL_HASH --> LOG_INFO
    UTIL_SMS --> LOG_ERROR
```

## 설정 및 의존성 관계

```mermaid
graph TD
    subgraph "설정 파일"
        CONFIG_MAIN[data_manager.json]
        CONFIG_TAG[tagstory_transcode_data_manager.json]
        CONFIG_THUMB[thumbnail_data_manager.json]
        PKG[package.json]
    end
    
    subgraph "메인 실행 파일"
        DM[data_manager.js]
        LIS[listen.js]
        TAG[tagstory_data_manager.js]
        THUMB[thumbnail_data_manager.js]
    end
    
    subgraph "공통 모듈"
        JS_API[js/Api.js]
        JS_DB[js/Dbdata.js]
        JS_LOG[js/logger.js]
        JS_UTIL[js/util.js]
        JS_JOB[js/job.js]
        JS_JC[js/job_creator.js]
        JS_JR[js/job_reporter.js]
    end
    
    subgraph "라우팅"
        ROUTES[routes/index.js]
    end
    
    %% 설정 파일 연결
    DM --> CONFIG_MAIN
    DM --> PKG
    LIS --> CONFIG_MAIN
    LIS --> PKG
    TAG --> CONFIG_TAG
    TAG --> PKG
    THUMB --> CONFIG_THUMB
    THUMB --> PKG
    
    %% 모듈 의존성
    DM --> JS_API
    DM --> JS_DB
    DM --> JS_LOG
    DM --> JS_UTIL
    DM --> JS_JOB
    DM --> JS_JC
    DM --> JS_JR
    
    LIS --> JS_API
    LIS --> JS_DB
    LIS --> JS_LOG
    LIS --> JS_UTIL
    LIS --> JS_JOB
    LIS --> ROUTES
    
    TAG --> JS_API
    TAG --> JS_DB
    TAG --> JS_LOG
    TAG --> JS_UTIL
    TAG --> JS_JOB
    TAG --> JS_JC
    TAG --> JS_JR
    
    THUMB --> JS_API
    THUMB --> JS_DB
    THUMB --> JS_LOG
    THUMB --> JS_UTIL
    THUMB --> JS_JOB
    THUMB --> JS_JC
    THUMB --> JS_JR
    
    ROUTES --> JS_JOB
    ROUTES --> JS_LOG
    
    %% 모듈 간 의존성
    JS_JC --> JS_JOB
    JS_JC --> JS_UTIL
    JS_JC --> JS_LOG
    JS_JR --> JS_UTIL
    JS_JR --> JS_LOG
    JS_JOB --> JS_UTIL
    JS_JOB --> JS_LOG
    JS_API --> JS_UTIL
    JS_API --> JS_LOG
    JS_DB --> JS_LOG
```

## 주요 기능별 역할

### 1. Data Manager (data_manager.js)
- **역할**: 시스템의 메인 진입점
- **기능**: 
  - 설정 파일 로드
  - 데이터베이스 연결 초기화
  - Job Creator와 Job Reporter 시작
  - 예외 처리 및 SMS 알림

### 2. Job Creator (job_creator.js)
- **역할**: 클립 정보를 수집하여 작업을 생성
- **기능**:
  - CP(Content Provider) 정보 조회
  - 외부 API에서 클립 정보 수집
  - 작업 등록 및 데이터베이스 저장
  - 주기적 폴링 (기본 5초)

### 3. Job Reporter (job_reporter.js)
- **역할**: 처리된 작업의 결과를 외부 시스템에 보고
- **기능**:
  - 처리 결과 데이터 조회
  - 외부 API로 결과 보고 전송
  - 주기적 폴링 (기본 15초)

### 4. Job Handler (job.js)
- **역할**: 개별 작업의 처리 로직 담당
- **기능**:
  - 작업 등록 및 변환
  - API 정보와 CP 정보 병합
  - 작업 상태 관리

### 5. API 모듈 (Api.js)
- **역할**: 외부 API 통신 및 SMS 알림
- **기능**:
  - HTTP/HTTPS 요청 처리
  - 재시도 로직
  - SMS 알림 전송
  - Slack 알림

### 6. Database 모듈 (Dbdata.js)
- **역할**: MySQL 데이터베이스 연결 및 쿼리 처리
- **기능**:
  - Master/Slave DB 연결 풀 관리
  - CP 정보, 설정, 보고 데이터 조회
  - 이벤트 정보 등록

### 7. Logger 모듈 (logger.js)
- **역할**: 로깅 및 알림 시스템
- **기능**:
  - Winston 기반 로깅
  - 일별 로그 파일 로테이션
  - SMS/메일 알림
  - 로그 레벨 관리

### 8. Util 모듈 (util.js)
- **역할**: 공통 유틸리티 함수
- **기능**:
  - 설정 파일 읽기
  - 시간 포맷팅
  - 해시 생성
  - SMS 전송
  - 파일 시스템 작업

### 9. HTTP 서버 (listen.js)
- **역할**: HTTP API 서버
- **기능**:
  - Express 기반 웹 서버
  - 작업 등록 API 제공
  - 멀티 프로세스 지원

이 시스템은 비디오 트랜스코딩 파이프라인의 데이터 관리 부분을 담당하며, 클립 정보 수집부터 작업 생성, 결과 보고까지의 전체 워크플로우를 관리합니다.


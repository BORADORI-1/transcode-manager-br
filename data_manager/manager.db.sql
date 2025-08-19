-- --------------------------------------------------------
-- 호스트:                          192.168.111.111
-- 서버 버전:                        10.2.10-MariaDB - MariaDB Server
-- 서버 OS:                        Linux
-- HeidiSQL 버전:                  9.5.0.5196
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;


-- transcoding 데이터베이스 구조 내보내기
CREATE DATABASE IF NOT EXISTS `transcoding` /*!40100 DEFAULT CHARACTER SET utf8 */;
USE `transcoding`;

-- 이벤트 transcoding.delete_heart_bit 구조 내보내기
DELIMITER //
CREATE DEFINER=`transcoding`@`%` EVENT `delete_heart_bit` ON SCHEDULE EVERY 1 DAY STARTS '2018-04-05 11:20:30' ON COMPLETION NOT PRESERVE ENABLE DO BEGIN
delete from T_HEARTBEAT where create_time < DATE_SUB(now(), INTERVAL 7 Day);
END//
DELIMITER ;

-- 테이블 transcoding.T_CLIPTYPE_INFO 구조 내보내기
CREATE TABLE IF NOT EXISTS `T_CLIPTYPE_INFO` (
  `cliptype` varchar(10) NOT NULL COMMENT 'clip 종류',
  `spid` varchar(64) NOT NULL COMMENT '고객사 ID',
  `minimum_playtime` int(11) NOT NULL COMMENT 'clip의 최소 허용 재생시간',
  `maximum_playtime` int(11) NOT NULL COMMENT 'clip의 최대 허용 재생시간',
  `desc` varchar(50) NOT NULL COMMENT 'clip 종류의 설명',
  PRIMARY KEY (`cliptype`),
  KEY `fk_cliptype_spid` (`spid`),
  CONSTRAINT `fk_cliptype_spid` FOREIGN KEY (`spid`) REFERENCES `T_SP_INFO` (`spid`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 내보낼 데이터가 선택되어 있지 않습니다.
-- 테이블 transcoding.T_CLIP_INFO 구조 내보내기
CREATE TABLE IF NOT EXISTS `T_CLIP_INFO` (
  `programid` varchar(45) DEFAULT NULL COMMENT '프로그램id',
  `programtitle` varchar(1024) DEFAULT NULL COMMENT '프로그램title',
  `cpid` varchar(5) NOT NULL COMMENT '컨텐츠프로바이더 ID',
  `corporatorcode` varchar(45) DEFAULT NULL COMMENT '방송사코드',
  `contentid` varchar(45) DEFAULT NULL COMMENT '콘텐츠ID',
  `cornerid` int(11) DEFAULT NULL COMMENT '코너ID',
  `contenttitle` varchar(1024) DEFAULT NULL COMMENT '컨텐츠 타이틀',
  `cliporder` int(11) DEFAULT NULL COMMENT '클립순서',
  `clipid` varchar(220) NOT NULL COMMENT '클립ID',
  `originid` varchar(220) NOT NULL COMMENT '컨텐츠프로바이더 별 클립ID',
  `spid` varchar(64) NOT NULL COMMENT '고객사 ID',
  `title` varchar(300) DEFAULT NULL COMMENT '클립타이틀',
  `originurl` varchar(4096) NOT NULL COMMENT '오리진URL(도메인정보 제거된 다운로드URL)',
  `mediaurl` varchar(4096) DEFAULT NULL COMMENT '미디아URL(서비스시 이용할 URL)',
  `downloadurl` varchar(4096) DEFAULT NULL COMMENT '다운로드URL(FULL URL)',
  `itemtypeid` int(11) DEFAULT NULL COMMENT '아이템타입ID',
  `cliptype` varchar(10) DEFAULT NULL COMMENT '클립타입',
  `clipcategory` varchar(5) DEFAULT NULL COMMENT '클립카테고리',
  `regdate` datetime DEFAULT NULL COMMENT '등록날짜',
  `modifydate` datetime NOT NULL COMMENT '수정날짜',
  `playtime` int(11) DEFAULT NULL COMMENT '클립길이',
  `starttime` int(11) DEFAULT NULL COMMENT '클립시작 위치',
  `endtime` int(11) DEFAULT NULL COMMENT '클립마지막 위치',
  `targetage` int(11) DEFAULT NULL COMMENT '시청가능 연령',
  `acquire` varchar(5) DEFAULT NULL COMMENT '클립 입수 여부',
  `priority` varchar(2) DEFAULT NULL COMMENT '입수처리 우선순위',
  `content_length` bigint(20) DEFAULT NULL COMMENT '''HTTP 헤더의  content_length''',
  `last_modified` varchar(45) DEFAULT NULL COMMENT '''HTTP 헤더의 modify_date''',
  PRIMARY KEY (`clipid`,`originid`),
  KEY `cp_id_idx` (`cpid`),
  KEY `fk_clipinfo_spid` (`spid`),
  CONSTRAINT `fk_clipinfo_cpid` FOREIGN KEY (`cpid`) REFERENCES `T_CP_INFO` (`cpid`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_clipinfo_spid` FOREIGN KEY (`spid`) REFERENCES `T_SP_INFO` (`spid`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 내보낼 데이터가 선택되어 있지 않습니다.
-- 테이블 transcoding.T_CONTACT 구조 내보내기
CREATE TABLE IF NOT EXISTS `T_CONTACT` (
  `spid` varchar(64) NOT NULL COMMENT '고객사ID',
  `cpid` varchar(5) NOT NULL COMMENT 'CP아이디(방송국)',
  `name` varchar(45) DEFAULT NULL COMMENT '담당자 이름',
  `number` varchar(125) NOT NULL COMMENT '담당자 전화번호',
  PRIMARY KEY (`cpid`,`number`),
  KEY `fk_contact_sp_id` (`spid`),
  CONSTRAINT `fk_contact_cp_id` FOREIGN KEY (`cpid`) REFERENCES `T_CP_INFO` (`cpid`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_contact_sp_id` FOREIGN KEY (`spid`) REFERENCES `T_SP_INFO` (`spid`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 내보낼 데이터가 선택되어 있지 않습니다.
-- 테이블 transcoding.T_CP_INFO 구조 내보내기
CREATE TABLE IF NOT EXISTS `T_CP_INFO` (
  `cpid` varchar(5) NOT NULL COMMENT 'CP ID(방송사)',
  `spid` varchar(64) NOT NULL COMMENT '고객사 ID',
  `worker_group_id` int(11) NOT NULL COMMENT 'worker group key',
  `name` varchar(128) DEFAULT NULL COMMENT '방송사 이름',
  `code` varchar(45) DEFAULT NULL,
  `source_path` varchar(4096) DEFAULT NULL COMMENT '방송사의 콘텐츠가 저장된 도메인 정보 및 경로',
  `need_report` int(11) DEFAULT NULL COMMENT '수집 처리 결과에 대한 보고 여부',
  `need_acquire` int(11) DEFAULT NULL COMMENT '해당 방송사의 정보를 수집처리 여부 설정',
  `request_url` varchar(256) DEFAULT NULL,
  `report_url` varchar(256) DEFAULT NULL,
  `rules` varchar(256) DEFAULT NULL,
  `allowextensions` varchar(256) DEFAULT NULL,
  `storage_path` varchar(1024) DEFAULT NULL COMMENT '클라우드 스토리지 마운트포인트',
  `need_smil` int(11) NOT NULL DEFAULT '0',
  `alert_group` varchar(256) DEFAULT NULL,
  `alert_admin_group` varchar(256) DEFAULT NULL,
  `disable_version` char(1) DEFAULT 'N' COMMENT 'mediaurl에 version 사용여부',
  `check_url_prefix` varchar(512) DEFAULT NULL,
  PRIMARY KEY (`cpid`,`spid`),
  KEY `fk_cp_spid` (`spid`),
  KEY `fk_cp_worker_group_id` (`worker_group_id`),
  CONSTRAINT `fk_cp_spid` FOREIGN KEY (`spid`) REFERENCES `T_SP_INFO` (`spid`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 내보낼 데이터가 선택되어 있지 않습니다.
-- 테이블 transcoding.T_DATA_MANAGER_CONFIG 구조 내보내기
CREATE TABLE IF NOT EXISTS `T_DATA_MANAGER_CONFIG` (
  `clip_data_polling_period` int(11) DEFAULT NULL COMMENT '클립 데이타 폴링 주기',
  `report_data_polling_period` int(11) DEFAULT NULL COMMENT '리포트 데이타 폴링 주기',
  `need_copy_original` int(11) DEFAULT NULL COMMENT '오리지날 파일 로컬 복사 여부',
  `heartbeat_period` int(11) DEFAULT NULL COMMENT '하트비트 주기',
  `heartbeat_timeout` int(11) DEFAULT NULL COMMENT '하트비트 타임아웃시간',
  `max_num_retry` int(11) DEFAULT NULL COMMENT '재시도 최고 횟수',
  `old_data_force_batch_mode` int(11) DEFAULT NULL COMMENT '오래된 클립의 배치처리 모드',
  `old_data_force_batch_mode_limit_day` int(11) DEFAULT NULL COMMENT '오래된 클립의 배치처리 기준 날짜',
  `sms_alarm` varchar(5) DEFAULT NULL COMMENT 'sms_alarm 사용 여부'
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 테이블 데이터 transcoding.T_DATA_MANAGER_CONFIG:~1 rows (대략적) 내보내기
DELETE FROM `T_DATA_MANAGER_CONFIG`;
/*!40000 ALTER TABLE `T_DATA_MANAGER_CONFIG` DISABLE KEYS */;
INSERT INTO `T_DATA_MANAGER_CONFIG` (`clip_data_polling_period`, `report_data_polling_period`, `need_copy_original`, `heartbeat_period`, `heartbeat_timeout`, `max_num_retry`, `old_data_force_batch_mode`, `old_data_force_batch_mode_limit_day`, `sms_alarm`) VALUES
	(60, 60, 1, 20, 60, 3, 1, 7, 'N');
/*!40000 ALTER TABLE `T_DATA_MANAGER_CONFIG` ENABLE KEYS */;

-- 내보낼 데이터가 선택되어 있지 않습니다.
-- 테이블 transcoding.T_HEARTBEAT 구조 내보내기
CREATE TABLE IF NOT EXISTS `T_HEARTBEAT` (
  `create_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성날짜',
  `type` varchar(5) NOT NULL DEFAULT '0' COMMENT '메너저 서버의 타입 DM = Master DataManager',
  `ip` varchar(45) DEFAULT NULL COMMENT 'IP 주소',
  KEY `hear_beat_idx` (`create_time`,`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 내보낼 데이터가 선택되어 있지 않습니다.
-- 테이블 transcoding.T_JOB 구조 내보내기
CREATE TABLE IF NOT EXISTS `T_JOB` (
  `job_id` int(11) NOT NULL AUTO_INCREMENT COMMENT '잡ID',
  `clipid` varchar(220) NOT NULL COMMENT '클립ID',
  `spid` varchar(64) NOT NULL COMMENT '고객사 ID',
  `cpid` varchar(5) NOT NULL COMMENT '컨텐츠프로바이더 ID',
  `rules` varchar(256) NOT NULL COMMENT '고객사 ID',
  `status` int(11) NOT NULL COMMENT '잡상태',
  `report_status` int(11) DEFAULT NULL COMMENT '0 : not reported, 2 : done, others : error ',
  `err_message` text NOT NULL COMMENT '에러메세지',
  `worker_id` int(11) DEFAULT NULL COMMENT '할당된 Worker ID',
  `encoding_time` int(11) DEFAULT NULL COMMENT '인코딩 소요시간',
  `downloading_time` int(11) DEFAULT NULL COMMENT 'Traffic 제한 여부 확인을 위하여 넣어둠',
  `create_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '잡생성시간',
  `update_date` datetime DEFAULT NULL COMMENT '잡수정시간',
  `cliptype` varchar(2) DEFAULT NULL COMMENT '클립타입',
  `downloadurl` varchar(4096) DEFAULT NULL COMMENT 'T_CLIP_INFO.source_path+ T_CLIP_INFO.originurl',
  `target_path` varchar(4096) CHARACTER SET utf8 COLLATE utf8_bin DEFAULT NULL COMMENT '저장될 위치',
  `version_id` int(11) DEFAULT '1' COMMENT '최조 버전의 job의 version_id 는 1로 기록한다.',
  `itemtypeid` int(11) DEFAULT NULL COMMENT '아이템 타입 ID',
  `priority` varchar(2) DEFAULT NULL COMMENT '잡처리 우선순위',
  `need_report` int(10) unsigned DEFAULT NULL,
  `need_copy_original` int(11) DEFAULT NULL,
  `related_job_id` int(11) DEFAULT NULL COMMENT '구간 정보가 있는 클립 영상일 경우 현재 처리중??',
  `num_retry` int(11) DEFAULT NULL,
  `playtime` int(11) DEFAULT NULL,
  `content_length` bigint(20) DEFAULT NULL COMMENT '''Http 헤더에서의 Content_length''',
  `last_modified` varchar(45) DEFAULT NULL COMMENT '''HTTP헤더에서의 modify_date''',
  PRIMARY KEY (`job_id`),
  KEY `clip_id_idx` (`clipid`),
  KEY `worker_id_idx` (`worker_id`),
  KEY `related_job_id` (`related_job_id`),
  KEY `join_keys` (`clipid`,`version_id`,`update_date`),
  KEY `status` (`status`,`update_date`),
  KEY `update_date` (`update_date`),
  KEY `fk_job_spid` (`spid`),
  KEY `fk_job_cpid` (`cpid`),
  CONSTRAINT `fk_clip_id` FOREIGN KEY (`clipid`) REFERENCES `T_CLIP_INFO` (`clipid`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_job_cpid` FOREIGN KEY (`cpid`) REFERENCES `T_CP_INFO` (`cpid`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_job_spid` FOREIGN KEY (`spid`) REFERENCES `T_SP_INFO` (`spid`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_related_job_id` FOREIGN KEY (`related_job_id`) REFERENCES `T_JOB` (`job_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_worker_id` FOREIGN KEY (`worker_id`) REFERENCES `T_WORKER` (`worker_id`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8;

-- 내보낼 데이터가 선택되어 있지 않습니다.
-- 테이블 transcoding.T_RULE 구조 내보내기
CREATE TABLE IF NOT EXISTS `T_RULE` (
  `ruleid` varchar(32) NOT NULL COMMENT '인코딩 옵션 ID',
  `report` int(11) DEFAULT NULL COMMENT 'report 로그 생성 여부(not use)',
  `fformat` varchar(8) DEFAULT NULL COMMENT '결과 파일의 포맷',
  `fpostfix` varchar(8) DEFAULT NULL COMMENT '결과 파일의 확장명 포함',
  `itemtypeid` int(11) DEFAULT NULL COMMENT '아이템 타입 ID',
  `vaspect` varchar(16) DEFAULT NULL COMMENT '화면 비율',
  `vfps` varchar(16) DEFAULT NULL COMMENT '초당 프레임',
  `vgop` int(11) DEFAULT NULL COMMENT 'key 프레임 간격',
  `vpix_fmt` varchar(16) DEFAULT NULL COMMENT '픽셀 정보',
  `vcodec` varchar(32) DEFAULT NULL COMMENT 'video 코덱 명',
  `vbitrate` varchar(8) DEFAULT NULL COMMENT '전송 속도',
  `vmaxrate` varchar(8) DEFAULT NULL COMMENT '최대 전송속도',
  `vbufsize` varchar(8) DEFAULT NULL COMMENT '버퍼 크기',
  `vprofile` varchar(8) DEFAULT NULL COMMENT '코덱 profile',
  `vlevel` varchar(8) DEFAULT NULL COMMENT '코덱 level',
  `vresolution` varchar(16) DEFAULT NULL COMMENT 'video 해상도',
  `vrefs` int(11) DEFAULT NULL COMMENT 'reference frames',
  `vcoder` int(11) DEFAULT NULL COMMENT 'CABAC 사용',
  `vtag` varchar(8) DEFAULT NULL COMMENT 'FourCC 태그',
  `acodec` varchar(32) DEFAULT NULL COMMENT 'audio 코덱 명',
  `abitrate` varchar(8) DEFAULT NULL COMMENT '전송속도',
  `afrequency` int(11) DEFAULT NULL COMMENT '샘플링 주파수',
  `achannel` int(11) DEFAULT NULL COMMENT '채널 수',
  `optional` varchar(256) DEFAULT NULL COMMENT '추가 설정',
  `condition` varchar(256) DEFAULT NULL COMMENT 'a:audio, v:video, c:세로영상, r:가로영상, s:정사각형영상 ',
  `description` varchar(256) DEFAULT NULL COMMENT '설명',
  PRIMARY KEY (`ruleid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 내보낼 데이터가 선택되어 있지 않습니다.
-- 테이블 transcoding.T_SP_INFO 구조 내보내기
CREATE TABLE IF NOT EXISTS `T_SP_INFO` (
  `spid` varchar(64) NOT NULL COMMENT '고객사 ID (key 조합에 사용되므로 최대한 짧게)',
  `desc` varchar(64) NOT NULL COMMENT '입수 데이터를 공유하는 서비스 들의 그룹 설명',
  PRIMARY KEY (`spid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 내보낼 데이터가 선택되어 있지 않습니다.
-- 테이블 transcoding.T_WORKER 구조 내보내기
CREATE TABLE IF NOT EXISTS `T_WORKER` (
  `worker_id` int(11) NOT NULL COMMENT '워커 ID',
  `address` varchar(256) NOT NULL COMMENT '워커 IP 주소',
  `port` int(11) NOT NULL,
  `num_cores` int(11) NOT NULL COMMENT '워커의 CPU코어수',
  `status` int(11) NOT NULL COMMENT '상태',
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '상태가 업데이트된 시간',
  `isbatch_group` int(11) DEFAULT NULL COMMENT '배치모드 여부',
  `progress` int(11) NOT NULL COMMENT '처리 중인 작업 수',
  `auto_recovery` varchar(1) NOT NULL DEFAULT 'Y' COMMENT '자동복구 여부',
  PRIMARY KEY (`worker_id`),
  UNIQUE KEY `address_idx` (`address`(220),`port`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 내보낼 데이터가 선택되어 있지 않습니다.
-- 테이블 transcoding.T_WORKER_GROUP 구조 내보내기
CREATE TABLE IF NOT EXISTS `T_WORKER_GROUP` (
  `worker_group_id` int(11) NOT NULL COMMENT 'worker 그룹의 key',
  `worker_list` varchar(256) DEFAULT NULL COMMENT 'worker id list',
  `downloader_list` varchar(256) DEFAULT NULL COMMENT 'worker id list',
  `description` varchar(256) DEFAULT NULL COMMENT '그룹 설명',
  PRIMARY KEY (`worker_group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 내보낼 데이터가 선택되어 있지 않습니다.
-- 테이블 transcoding.T_WORKER_MANAGER_CONFIG 구조 내보내기
CREATE TABLE IF NOT EXISTS `T_WORKER_MANAGER_CONFIG` (
  `job_polling_period` int(11) DEFAULT NULL COMMENT '잡의 폴링 주기',
  `storage_path` varchar(1024) DEFAULT NULL COMMENT '클라우드 스토리지 end포인트',
  `original_path` varchar(1024) DEFAULT NULL COMMENT '클라우드 스토리지 원본 파일 저장 포인트',
  `heartbeat_timeout` int(11) DEFAULT NULL COMMENT '하트비트 타임아웃 시간',
  `check_path` varchar(1024) DEFAULT NULL COMMENT '클라우드 스토리지 상태 check 포인트',
  `heartbeat_period` int(11) DEFAULT NULL COMMENT '하트비트 전송 주기',
  `job_wait_timeout` int(11) DEFAULT NULL COMMENT '잡처리 완료 대기 타임아웃 시간',
  `sms_alarm` varchar(5) DEFAULT NULL COMMENT 'SMS 알람 사용여부',
  `search_count` int(11) DEFAULT NULL COMMENT '작업 확인 단위'
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 테이블 데이터 transcoding.T_WORKER_MANAGER_CONFIG:~1 rows (대략적) 내보내기
DELETE FROM `T_WORKER_MANAGER_CONFIG`;
/*!40000 ALTER TABLE `T_WORKER_MANAGER_CONFIG` DISABLE KEYS */;
INSERT INTO `T_WORKER_MANAGER_CONFIG` (`job_polling_period`, `storage_path`, `original_path`, `heartbeat_timeout`, `check_path`, `heartbeat_period`, `job_wait_timeout`, `sms_alarm`, `search_count`) VALUES
	(10, '/stg/smcstorage', '/origin', 600, '/check/check.txt', 60, 3600, 'Y', 1);
/*!40000 ALTER TABLE `T_WORKER_MANAGER_CONFIG` ENABLE KEYS */;

-- 내보낼 데이터가 선택되어 있지 않습니다.
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IF(@OLD_FOREIGN_KEY_CHECKS IS NULL, 1, @OLD_FOREIGN_KEY_CHECKS) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;

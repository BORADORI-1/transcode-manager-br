/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
var fs = require('fs');
var mysql = require('mysql');
var async = require('async');
var os = require('os');
var request = require('request');
var path = require('path');
var url = require('url');
var querystring = require('querystring');

var config;
var manager_config = {};
var acquire_code = 2;
//var config_file = '/usr/service/etc/transcode_data_manager.json';
var config_file = '/usr/service/etc/tagstory_transcode_data_manager.json';

var sms_admin_group = [];
function npad(n, width) {
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
}

function is_valid_number(val)
{
    if('number' !== typeof(val))
    {
        val = parseInt(val);
    }
    if(isNaN(val))
    {
        return false;
    }
    return true;
}

function is_valid(val)
{
    if(undefined === val || null === val)
    {
        return false;
    }
    return true;
}

function is_valid_data(val)
{
    if(undefined === val || null === val || '' === val)
    {
        return false;
    }
    return true;
}

function mkdir_for_file(target_path)
{
    var path_list = target_path.split('/');
    var tpath = '';
    var dir_count = path_list.length-1;

    for(var key = 0; key < dir_count; ++key)
    {    
        tpath += path_list[key]+'/';
        if(!fs.existsSync(tpath))
        {    
            fs.mkdirSync(tpath, 0755);
        }    
    }    
}

// Base Config Read
try {
    if(process.argv[2] != undefined)
    {    
        config_file = process.argv[2];
    }

    config = JSON.parse(fs.readFileSync(config_file,'utf8'));
    // DB 설정이 없는 경우
    if(config.smc_db === null || config.smc_db === undefined || config.smc_db === "") {
        // 없는 경우 종료시킨다
        console.log("[CRITICAL] smc_db not found .. check configuration.json syntax");
        process.exit(1);
    }

    if(config.smc_db.master === null || config.smc_db.master === undefined || config.smc_db.master === "") {
        // 없는 경우 종료시킨다
        console.log("[CRITICAL] smc_db master config not found .. check configuration.json syntax");
        process.exit(1);
    }

    if(config.smc_db.backup === null || config.smc_db.backup === undefined || config.smc_db.backup === "") {
        // 없는 경우 종료시킨다
        console.log("[CRITICAL] smc_db backup config not found .. check configuration.json syntax");
        process.exit(1);
    }

    // URL 설정이 없는 경우
    if(config.smc_clipinfo_request_url === null || config.smc_clipinfo_request_url === undefined || config.smc_clipinfo_request_url === "") {
        // 없는 경우 종료시킨다
        console.log("[CRITICAL] smc_clipinfo_request_url not found .. check configuration.json syntax");
        process.exit(1);
    }

    if(config.smc_clipinfo_report_url === null || config.smc_clipinfo_report_url === undefined || config.smc_clipinfo_report_url === "") {
        // 없는 경우 종료시킨다
        console.log("[CRITICAL] smc_clipinfo_report_url not found .. check configuration.json syntax");
        process.exit(1);
    }

    if(config.media_check_url === null || config.media_check_url === undefined || config.media_check_url === "") {
        // 없는 경우 경고
        console.log("[WARNING] media_check_url not found .. check configuration.json syntax");
        config.media_check_url = "";
//        process.exit(1);
    }

    // process_type 이 없는 경우
    if(config.process_type === null || config.process_type === undefined || config.process_type === "") {
        // 없는 경우 종료시킨다
        console.log("[CRITICAL] process_type not found .. check configuration.json syntax");
        process.exit(1);
    }

    // Log Path 없는 경우
    if(config.log_path === null || config.log_path === undefined || config.log_path === "") {
        // 없는 경우 종료시킨다
        console.log("[CRITICAL] log_path not found .. check configuration.json syntax");
        process.exit(1);
    }

    // Log Level 없는 경우
    if(config.log_level === null || config.log_level === undefined || config.log_level === "") {
        // 없는 경우 종료시킨다
        console.log("[CRITICAL] log_path not found .. check configuration.json syntax");
        process.exit(1);
    }
    // runmode 없는 경우
    if(config.runmode === null || config.runmode === undefined || config.runmode === "") {
        // 없는 경우 종료시킨다
        // 일반 모드임
        config.runmode = 'normal';
    }

    if(config.default_alert_group === undefined || config.default_alert_group === null || config.default_alert_group === '' || config.default_alert_group.length <= 0) {
        // 없는 경우 종료시킨다
        console.log("[CRITICAL] default_alert_group not found .. check configuration.json syntax");
        process.exit(1);
    }
    for(var key in config.default_alert_group)
    {
        sms_admin_group.push(config.default_alert_group[key]);
    }

    /*
    // work_type 없는 경우
    if(config.work_type === null || config.work_type === undefined || config.work_type === "") {
        // 없는 경우 종료시킨다
        console.log("[CRITICAL] work_type not found .. check configuration.json syntax");
        process.exit(1);
    }

    // cpid 없는 경우
    if(config.cpid === null || config.cpid === undefined) {
        // 없는 경우 종료시킨다
        console.log("[CRITICAL] cpid not found .. check configuration.json syntax");
        process.exit(1);
    }
    */
} catch(e) {
    console.log("[CRITICAL] configuration.json error .. check configuration.json syntax "+JSON.stringify(e));
    process.exit(1);
}

// DB Connector 생성
// MySQL Connecting by Pool
var pool_master = mysql.createPool(config.smc_db.master);
if(pool_master === null || pool_master === undefined || pool_master === "") {
    console.log("[CRITICAL] Master DB POOL Make Fail");
    process.exit(1);
}
var pool_backup = mysql.createPool(config.smc_db.backup);
if(pool_backup === null || pool_backup === undefined || pool_backup === "") {
    console.log("[CRITICAL] Backup DB POOL Make Fail");
    process.exit(1);
}

// Logger 생성
var winston = require('winston');
var logger = new winston.Logger({
    transports: [
        new winston.transports.Console({
            level: config.log_level,
            json: false,
            timestamp: function() {
                var pad = function(num,field){
                    var n = '' + num;
                    var w = n.length;
                    var l = field.length;
                    var pad = w < l ? l-w : 0;
                    return field.substr(0,pad) + n;
                };
                var current = new Date();
                var logtime = pad(current.getHours(), '00') + ":" + pad(current.getMinutes(), '00') + ":" + pad(current.getSeconds(), '00') + "." + pad(current.getMilliseconds(), '000');
                return logtime;
            }
        }),
        new winston.transports.DailyRotateFile({
            level: config.log_level,
            json: false,
            dirname: config.log_path,
            filename: 'datamanager_type2',
            datePattern: 'yyyy-MM-dd.log',
            timestamp: function() {
                var pad = function(num,field){
                    var n = '' + num;
                    var w = n.length;
                    var l = field.length;
                    var pad = w < l ? l-w : 0;
                    return field.substr(0,pad) + n;
                };
                var current = new Date();
                var logtime = pad(current.getHours(), '00') + ":" + pad(current.getMinutes(), '00') + ":" + pad(current.getSeconds(), '00') + "." + pad(current.getMilliseconds(), '000');
                return logtime;
            }
        })
    ]
});

if(logger === null || logger === undefined || logger === "") {
    console.log("[CRITICAL] Logger Create Fail");
    process.exit(1);
}

// Exception Handler
process.on('uncaughtException', function (err) {
    logger.error('Caught exception: ' + err);
    if(err.stack) {
        logger.error('Stacktrace: ');
        logger.error(err.stack);
    }
    // 2015-07-08 긴급패치 jhkim
    smscall('[acquire] Exception Occurred CRITICAL', {group: config.default_alert_group }, null);
    process.exit(2);
});

var timerObj_process_controller;
var timerObj_clipinforeceiver_jobcreator;
var timerObj_clipinforeporter;
//var allowextensions = ['mp3', 'mp4'];

// SMS Filtering
var start_time = new Date();
var start_new = new Date(start_time.getFullYear(), start_time.getMonth(), start_time.getDate(), 0, 0, 0);
var sms_filtering_http = {};
var sms_filtering_json = {};
sms_filtering_http['[api] TAGSTORY clipacquirelist http error'] = { ctime: start_new, count: 0 };
sms_filtering_json['[api] TAGSTORY clipacquirelist json error'] = { ctime: start_new, count: 0 };

/* 에러로 인하여 SMS 중복 전송 우려 */
var clipacquirelist_api_error = false;
var clipacquirereport_api_error = {};
var cp_success_count = 0;
var enable_cp_count = 0;

// Main Flow
async.series([
    function(series_callback) {
        // T_DATA_MANAGER 로 부터 Config를 가져온다
        async.waterfall([
            function(waterfall_callback) {
                // DB Connection을 가져온다
                getDBConnection('MAIN', function(err, dbConnection) {
                    if(err) {
                        logger.error("[DataManager] All DB Connection Fail - SMS (ANALYTIC)");
                        waterfall_callback(err, null);
                    } else {
                        logger.debug("[DataManager] Get DB Connection Success");
                        waterfall_callback(null, dbConnection);
                    }
                });
            },
            function(db_connection, waterfall_callback) {
                var sql_query = 'SELECT * FROM T_DATA_MANAGER_CONFIG LIMIT 1';
                logger.debug(sql_query);
                db_connection.query(sql_query, function(err, result) {
                    if(err) {
                        // DB Query Error
                        db_connection.release();
                        logger.error("DB Error = " + err);
                        waterfall_callback(err, null);
                    } else {
                        db_connection.release();
                        manager_config.clip_data_polling_period = result[0].clip_data_polling_period;
                        manager_config.heartbeat_period = result[0].heartbeat_period;
                        manager_config.heartbeat_timeout = result[0].heartbeat_timeout;
                        manager_config.max_num_retry = result[0].max_num_retry;
                        manager_config.need_copy_original = result[0].need_copy_original;
                        manager_config.report_data_polling_period = result[0].report_data_polling_period;
                        manager_config.old_data_force_batch_mode = result[0].old_data_force_batch_mode;
                        manager_config.old_data_force_batch_mode_limit_day = result[0].old_data_force_batch_mode_limit_day;
                        waterfall_callback(null, "Data Manager Configuration Read from DB Success");
                    }
                });
            }
        ]
        ,function(waterfall_err, waterfall_result) {
            if(waterfall_err) {
                // Error 처리
                series_callback(waterfall_err, null);
            } else {
                // 정상
                series_callback(null, "Get DB T_DATA_MANAGER Config Get Success");
            }
        });
    },

    function(series_callback) {
        // Master 인지 Slave 인지 확인하여 Process Controller를 띄운다
        if(config.process_type === "master") {
            // Master
            timerObj_process_controller = setTimeout(process_controller_master, manager_config.heartbeat_period * 10);
            if(timerObj_process_controller === null || timerObj_process_controller === undefined || timerObj_process_controller === "") {
                // Error
                series_callback(new Error("Process Controller Timer Create Fail - SMS (ANALYTIC)"), null);
            } else {
                series_callback(null, "Success Create Process Controller");
            }
        } else {
            // Slave
            timerObj_process_controller = setTimeout(process_controller_slave, manager_config.heartbeat_period * 1000);
            if(timerObj_process_controller === null || timerObj_process_controller === undefined || timerObj_process_controller === "") {
                // Error
                series_callback(new Error("Process Controller Timer Create Fail - SMS (ANALYTIC)"), null);
            } else {
                series_callback(null, "Success Create Process Controller");
            }
        }
    },

    function(series_callback) {
        if(config.process_type === "master") {
            // Master에 한하여 ClipInfoReceiver_JobCreator
            timerObj_clipinforeceiver_jobcreator = setTimeout(clipinforeceiver_jobcreator, 5 * 1000);
            if(timerObj_clipinforeceiver_jobcreator === null || timerObj_clipinforeceiver_jobcreator === undefined || timerObj_clipinforeceiver_jobcreator === "") {
                // Error
                series_callback(new Error("ClipInfoReceiver_JobCreator Timer Create Fail - SMS (ANALYTIC)"), null);
            } else {
                series_callback(null, "Success Create ClipInfoReceiver_JobCreator");
            }
        } else {
            series_callback(null, "Skipping Create ClipInfoReceiver_JobCreator");
        }
    },

    function(series_callback) {
        if(config.process_type === "master") {
            // Master에 한하여
            timerObj_clipinforeporter = setTimeout(clipinforeporter, 15 * 1000);
            if(timerObj_clipinforeporter === null || timerObj_clipinforeporter === undefined || timerObj_clipinforeporter === "") {
                // Error
                series_callback(new Error("ClipInfoReporter Timer Create Fail - SMS (ANALYTIC)"), null);
            } else {
                series_callback(null, "Success Create ClipInfoReporter");
            }
        } else {
            series_callback(null, "Skipping Create ClipInfoReporter");
        }
    }
]
,function(series_err, series_result) {
    if(series_err) {
        // 에러발생
        logger.crit("[CRITICAL] Error Occurred : " + series_err + "  .. exit");
        smscall('[acquire] cannot start...', {group: config.default_alert_group }, null);
        process.exit(1);
    } else {
        var ipaddress = getipaddress();
        logger.debug(series_result);
        logger.debug(manager_config);
        logger.debug("[DATA Manager] Start Success");
        smscall('[acquire] Data Manager (' + config.process_type + ') Started from ' + ipaddress[0], {group: config.default_alert_group }, null);
    }
});

// Functions & Modules
function process_controller_master() {
    // Timer 정지
    clearTimeout(timerObj_process_controller);
    timerObj_process_controller = null;
    logger.debug("[PC_MASTER] Start");
    // Heartbeat Record를 기록한다
    async.waterfall([
        function(waterfall_callback) {
            logger.debug("[PC_MASTER] Get DB Connection");
            getDBConnection('MASTER', function(err, dbConnection) {
                if(err) {
                    logger.error("[PC_Master] All DB Connection Fail");
                    waterfall_callback(err, null);
                } else {
                    logger.debug("[PC_Master] Get DB Connection Success");
                    waterfall_callback(null, dbConnection);
                }
            });
        },
        function(db_connection, waterfall_callback) {
            // IP주소 가져오기
            var ipaddress = getipaddress();
            logger.debug(ipaddress[0]);
            //console.log(ipaddress[0]);
            // DB Connection을 가지고 Heartbeat Insert 수행
            var sql_query = 'INSERT INTO T_HEARTBEAT (create_time, type, ip) value (now(), \'DM2\', \'' + ipaddress[0] + '\');';
            logger.debug(sql_query);
            db_connection.query(sql_query, function(err, result) {
                if(err) {
                    db_connection.release();
                    logger.error('[PC_Master] DB Insert Query Fail : ' + err + ' - SMS (ANALYTIC)');
                    waterfall_callback(new Error("DB Insert Query Fail - SMS (ANALYTIC)"), null);
                } else {
                    // 성공
                    db_connection.release();
                    waterfall_callback(null, "[PC_Master] Heartbeat Insert OK");
                }
            });
        }
    ],
    function(waterfall_err, waterfall_result) {
        if(waterfall_err) {
            // Error 발생
            logger.error("[PC_MASTER] Heartbeat Fail - SMS (ANALYTIC)");
            logger.debug(waterfall_err);
            timerObj_process_controller = setTimeout(process_controller_master, manager_config.heartbeat_period * 1000);
        } else {
            // 성공
            // 다시 타이머 기동
            logger.debug("[PC_MASTER] Heartbeat Success");
            timerObj_process_controller = setTimeout(process_controller_master, manager_config.heartbeat_period * 1000);
        }
    });
}

function process_controller_slave() {
    // Timer 정지
    clearTimeout(timerObj_process_controller);
    timerObj_process_controller = null;
    logger.debug("[PC_Slave] Start");
    async.waterfall([
        function(waterfall_callback) {
            // DB Connection 가져오기
            getDBConnection('SLAVE', function(err, dbConnection) {
                if(err) {
                    logger.error("[PC_Slave] All DB Connection Fail - SMS (ANALYTIC)");
                    waterfall_callback(err, null);
                } else {
                    logger.debug("[PC_Slave] Get DB Connection Success");
                    waterfall_callback(null, dbConnection);
                }
            });
        },
        function(db_connection, waterfall_callback) {
            // DM Hearbeat를 가져온다
            var sql_query = 'SELECT *, now() as cur_time FROM T_HEARTBEAT WHERE type=\'DM2\' ORDER BY create_time DESC limit 1; ;';
            logger.debug('[PC_Slave] ' + sql_query);
            db_connection.query(sql_query, function(err, result) {
                if(err) {
                    db_connection.release();
                    logger.debug("[PC_Slave] DB Select Query Fail - SMS (ANALYTIC)");
                    waterfall_callback(new Error("DB Select Query Fail - SMS (ANALYTIC)"), null);
                } else {
                    // 성공
                    waterfall_callback(null, db_connection, result);
                }
            });
        },
        function(db_connection, select_result, waterfall_callback) {
            // 시간차이를 확인한다
            var result_time = new Date(select_result[0].create_time);
            var current_time = new Date(select_result[0].cur_time);
            var diffsec = (current_time.getTime() - result_time.getTime()) / 1000;
            logger.debug('[PC_Slave] Diff Sec = ' + diffsec + ' secs : CUR=' + current_time.getTime() + ' / RESULT=' + result_time.getTime());
            if(diffsec >= manager_config.heartbeat_timeout) {
                // Master Dead --> Fail Over
                logger.debug('[PC_Slave] Fail Over .... Heartbeat Timeout=' + diffsec + " secs");

                // Master 전환
                timerObj_process_controller = setTimeout(process_controller_master, manager_config.heartbeat_period * 10);
                if(timerObj_process_controller === null || timerObj_process_controller === undefined || timerObj_process_controller === "") {
                    // Error
                    waterfall_callback(new Error("Process Controller Timer Create Fail - SMS (ANALYTIC)"), null);
                } else {
                    timerObj_clipinforeceiver_jobcreator = setTimeout(clipinforeceiver_jobcreator, 5 * 1000);
                    if(timerObj_clipinforeceiver_jobcreator === null || timerObj_clipinforeceiver_jobcreator === undefined || timerObj_clipinforeceiver_jobcreator === "") {
                        // Error
                        waterfall_callback(new Error("ClipInfoReceiver_JobCreator Timer Create Fail - SMS (ANALYTIC)"), null);
                    } else {
                        timerObj_clipinforeporter = setTimeout(clipinforeporter, 10 * 1000);
                        if(timerObj_clipinforeporter === null || timerObj_clipinforeporter === undefined || timerObj_clipinforeporter === "") {
                            // Error
                            series_callback(new Error("ClipInfoReporter Timer Create Fail - SMS (ANALYTIC)"), null);
                        } else {
                            smscall('[acquire] Data Manager Fail Over to Slave', {group: config.default_alert_group }, null);
                            waterfall_callback(null, "Failover Success");
                        }
                    }
                }
            } else {
                // Normal
                // DS Heartbeat 기록
                // IP주소 가져오기
                var ipaddress = getipaddress();
                var sql_query = 'INSERT INTO T_HEARTBEAT (create_time, type, ip) value (now(), \'DS2\', \'' + ipaddress[0] + '\');';
                logger.debug("[PC_Slave] " + sql_query);
                db_connection.query(sql_query, function(err, result) {
                    if(err) {
                        db_connection.release();
                        logger.debug("[PC_Slave] DB Insert Query Fail : " + err + " - SMS (ANALYTIC)");
                        waterfall_callback(new Error("DB Insert Query Fail - SMS (ANALYTIC)"), null);
                    } else {
                        // 성공
                        db_connection.release();
                        waterfall_callback(null, "Normal Success");
                    }
                });
            }
        }
    ],
    function(waterfall_err, waterfall_result){
        if(waterfall_err) {
            logger.error("[PC_SLAVE] " + waterfall_err);
        } else {
            if(waterfall_result === 'Failover Success') {
                // Fail Over
                logger.debug("[PC_SLAVE] " + waterfall_result);
            } else {
                // Normal
                logger.debug("[PC_SLAVE] " + waterfall_result);
                timerObj_process_controller = setTimeout(process_controller_slave, manager_config.heartbeat_period * 1000);
            }
        }
    });
}

function clipinforeceiver_jobcreator() {
    // Timer를 정지한다
    clearTimeout(timerObj_clipinforeceiver_jobcreator);
    timerObj_clipinforeceiver_jobcreator = null;

    logger.debug("[CJ] Start");
    //logger.debug("[CJ] Target URL : " + config.smc_clipinfo_request_url);

    async.waterfall([
        function(main_waterfall_callback) {
            // DB Connection을 가져온다
            getDBConnection('MAIN', function(err, dbConnection) {
                if(err) {
                    logger.error("[CJ] All DB Connection Fail - SMS (ANALYTIC)");
                    smscall("[acquire] DB Connection Fail", {group: config.default_alert_group }, null);
                    main_waterfall_callback(err, null);
                    return;
                } else {
                    logger.debug("[CJ] Get DB Connection Success");
                    main_waterfall_callback(null, dbConnection);
                    return;
                }
            });
        },
        function(db_connection, main_waterfall_callback) {
            // DB Connection으로 T_CP_INFO를 읽어온다
            //var sql_query = 'select * from T_CP_INFO where need_report=2 and need_acquire=2 and length(source_path) > 0;';
            var sql_query = 'select * from T_CP_INFO where need_acquire='+acquire_code+' and length(source_path) > 0;';
            logger.debug(sql_query);
            db_connection.query(sql_query, function(err, result) {
                if(err) {
                    db_connection.release();
                    logger.error("[CJ] DB Select Query from T_CP_INFO Fail - SMS (ANALYTIC)" );
                    smscall("[acquire] DB Select Query Fail", {group: config.default_alert_group }, null);
                    main_waterfall_callback(err, null);
                    return;
                } else {
                    // DB 연결을 끊고 결과를 가지고 다음 단계로 간다
                    db_connection.release();
                    logger.debug("[CJ] CP List Result=" + JSON.stringify(result));
                    main_waterfall_callback(null, result);
                    return;
                }
            });
        },
        function(cp_info_list, main_waterfall_callback) {
            if(cp_info_list.length > 0) {
                // 현재 가능한 CP 숫자를 저장한다
                enable_cp_count = cp_info_list.length;
                cp_success_count = 0;
                async.each(cp_info_list, function(main_cp_info, each_callback) {
                    logger.debug("[CJ] ************************** CP : " + main_cp_info.name + " START **********************************");
                    var sms_report = [];
                    var sms_group = [];

                    sms_report = JSON.parse(JSON.stringify(sms_admin_group));
                    sms_group = JSON.parse(JSON.stringify(sms_admin_group));
                    if(main_cp_info.alert_group)
                    {
                        sms_report = sms_report.concat(main_cp_info.alert_group.split(','));
                    }
                    if(main_cp_info.alert_admin_group)
                    {
                        sms_report = sms_report.concat(main_cp_info.alert_admin_group.split(','));
                        sms_group = sms_group.concat(main_cp_info.alert_admin_group.split(','));
                    }

                    sms_group=sms_group.reduce(function(a,b){if(a.indexOf(b)<0)a.push(b);return a;},[]);
                    sms_admin_group=sms_admin_group.reduce(function(a,b){if(a.indexOf(b)<0)a.push(b);return a;},[]);
                    sms_report=sms_report.reduce(function(a,b){if(a.indexOf(b)<0)a.push(b);return a;},[]);
                    async.waterfall([
                       function(waterfall_callback)  {
                           var request_form =
                           {
                               cpid: main_cp_info.cpid,
                               clipid: '',
                               type: 'recent',
                               acquire: 'N'
                           };

                           // request api 호출
                           function cb_gethttpgetretry(err, result)
                           {
                               if(err) {
                                   // 오류발생시 waterfall을 빠져나가고 다음 Turn으로 넘어간다
                                   logger.error("[CJ] Error : " + err + " SMS (ANALYTIC/CMS)");
                                   smscall('[api] ' + main_cp_info.name + ' clipacquirelist http error', {group: sms_group }, null);
                                   waterfall_callback(new Error('CMS Server Error - clipacquirelist'), null);
                                   return;
                               }
                               // HTTP POST Receive 성공
                               // 다음 단계로 간다
                               logger.debug("[CJ] clipacquirelist call Success : " + result.body);
                               // 2015-08-31 Tab 문자 제거 Tab->Space
                               var tab_removebody = result.body.replace(/\t/g, ' ');
                               //var quot_fixbody = replaceAll('＂data＂', '"data"', result.body);
                               var quot_fixbody = replaceAll('＂data＂', '"data"', tab_removebody);
                               waterfall_callback(null, quot_fixbody);
                           }
                           gethttpgetretry(main_cp_info.request_url, request_form, 300000, 3, cb_gethttpgetretry);
                       },
                       function(bodydata, waterfall_callback) {
                           // 수신데이터 검증
                           var body_data = null;
                           var skipping = false;
                           try {
                               body_data = JSON.parse(bodydata);
                           } catch(err) {
                               // 만일 JSON 파싱오류 발생시 다음턴으로 간다
                               skipping = true;
                               logger.error("[CJ] Error : JSON Data Parsing Error");
                               smscall('[api] ' + main_cp_info.name + ' clipacquirelist json error', {group: sms_group }, null);
                               waterfall_callback(new Error('JSON Data Parsing Error - SMS'), null);
                               return;
                           }

                           if(!skipping) {
                                if(body_data.data === undefined) {
                                    // data 항목이 없는 경우 오류처리하고 다음턴으로 간다
                                    logger.error("[CJ] Error : JSON Data data field not exist - SMS (ANALYTIC/CMS)");
                                    smscall('[api] ' + main_cp_info.name + ' clipacquirelist json error', {group: sms_group }, null);
                                    waterfall_callback(new Error('JSON Data data field not exist - SMS (ANALYTIC/CMS)'), null);
                                    return;
                                }
                                var clipinfolist = body_data.data;
                                if(clipinfolist === null || clipinfolist === undefined || clipinfolist === "" || clipinfolist.length < 1) {
                                    // Data Empty Error
                                    // 데이터가 없는 경우 다음턴으로 간다
                                    logger.debug("[CJ] Error : Empty Body");
                                    waterfall_callback(new Error('Empty Body'), 1);
                                } else {
                                    // Data가 있으면 다음단계로 간다
                                    waterfall_callback(null, clipinfolist);
                                }
                           }
                       },
                       function(clipinfolist, waterfall_callback) {
                           if(clipinfolist === null || clipinfolist === undefined || clipinfolist === '') {
                               // clipinfo가 없는 경우 오류처리 - 다음턴으로 나간다
                               waterfall_callback(new Error('No clipinfolist Error'), null);
                           } else {
                               // Clipinfo 의 갯수만큼 반복한다
                               if(clipinfolist.length <= 0) {
                                   // List가 1개 이상일때만 작업한다 그렇지 않으면 오류처리
                                   waterfall_callback(new Error('No clipinfolist Error'), null);
                               } else {
                                   // clipinfolist 의 갯수만큼 반복한다
                                   logger.debug("[CJ] Total Target Clipinfo Count = " + clipinfolist.length);
                                   async.eachSeries(clipinfolist, function(clipinfo, eachseries_callback) {
                                       var downloadurl = '';
                                       var version = '';
                                       var http_clipinfo_version = 0;
                                       var db_clipinfo_version = 0;
                                        async.waterfall([
                                            function(each_waterfall_callback) {
                                                var no_error = true;
                                                var tdate;
                                                var tyyyy;
                                                var tmon;
                                                var tday;
                                                var thour;
                                                var tmin;
                                                var tsec;
                                                // 데이터 검증
                                                if(clipinfo.cpid === undefined) {
                                                    logger.error("[CJ] Error : No cpid");
                                                    no_error = false;
                                                }
                                                if(clipinfo.corporatorcode === undefined) {
                                                    logger.error("[CJ] Error : No corporatorcode");
                                                    no_error = false;
                                                }
/*
 * TagStory 에서는 clipid가 아닌 contentid가 key 임
 */
                                                {
                                                    var tmp_key = clipinfo.contentid;
                                                    clipinfo.contentid = clipinfo.clipid;
                                                    clipinfo.clipid = tmp_key;
                                                }
/*
 * TagStory 에서는 clipid가 아닌 contentid가 key 임
 */
                                                if(clipinfo.clipid === undefined) {
                                                    logger.error("[CJ] Error : No clipid");
                                                    no_error = false;
                                                }else
                                                {
                                                    clipinfo.originid = clipinfo.clipid;
                                                    clipinfo.clipid = main_cp_info.spid+"_"+clipinfo.cpid+"_"+clipinfo.originid;
                                                }
                                                if(clipinfo.originurl === undefined) {
                                                    logger.error("[CJ] Error : No originurl");
                                                    no_error = false;
                                                } else {
                                                    clipinfo.originurl = mytrim(clipinfo.originurl);

                                                    var col_index = clipinfo.originurl.indexOf(':');
                                                    if(col_index >= 0)
                                                    {
                                                        logger.error("[CJ] Error : Found colon at originurl (" + clipinfo.originurl +")");
                                                        no_error = false;
                                                    }
                                                }
                                                if(clipinfo.downloadurl === undefined) {
                                                    logger.error("[CJ] Error : No downloadurl");
                                                    no_error = false;
                                                } else {
                                                    // downloadurl의 프로토콜이 https인지 체크
                                                    if(clipinfo.downloadurl !== '')
                                                    {
                                                        var durl = url.parse(clipinfo.downloadurl);
                                                        var check_name = querystring.unescape(durl.pathname.slice(durl.pathname.lastIndexOf('/')));
                                                        if(durl.protocol !== 'https:' && durl.protocol !== 'http:')
                                                        {
                                                            logger.error("[CJ] Error : Not Allowed Protocol (" + durl.protocol + ")");
                                                            no_error = false;
                                                        }
                                                        if(clipinfo.originurl.slice(clipinfo.originurl.lastIndexOf('/')) !== check_name)
                                                        {
                                                            logger.error("[CJ] Error : Not Allowed different filename ( originurl = " +clipinfo.originurl.slice(clipinfo.originurl.lastIndexOf('/'))
                                                                    +", downloadurl = "+check_name+ ") ");
                                                            no_error = false;
                                                        }
                                                    }
                                                }
                                                if(clipinfo.mediaurl === undefined) {
                                                    logger.error("[CJ] Error : No mediaurl");
                                                    no_error = false;
                                                }
                                                if(clipinfo.regdate === undefined) {
                                                    logger.error("[CJ] Error : No regdate");
                                                    no_error = false;
                                                }else if(0 <= clipinfo.regdate.indexOf('-')
                                                        || 0 <= clipinfo.regdate.indexOf(':'))
                                                {
                                                    try{
                                                        tdate = new Date(clipinfo.regdate);
                                                        tyyyy = tdate.getFullYear();
                                                        tmon = npad(tdate.getMonth()+1, 2);
                                                        tday = npad(tdate.getDate(), 2);
                                                        thour = npad(tdate.getHours(), 2);
                                                        tmin = npad(tdate.getMinutes(), 2);
                                                        tsec = npad(tdate.getSeconds(), 2);
                                                        clipinfo.regdate = ''+tyyyy+''+tmon+''+tday+''+thour+''+tmin+''+tsec;
                                                    }catch(err)
                                                    {
                                                        logger.error("[CJ] Error : parse regdate error '"+clipinfo.regdate+"' ");
                                                        no_error = false;
                                                    }
                                                }
                                                if(clipinfo.modifydate === undefined) {
                                                    logger.error("[CJ] Error : No modifydate");
                                                    no_error = false;
                                                }else if(0 <= clipinfo.modifydate.indexOf('-')
                                                        || 0 <= clipinfo.modifydate.indexOf(':'))
                                                {
                                                    try{
                                                        tdate = new Date(clipinfo.modifydate);
                                                        tyyyy = tdate.getFullYear();
                                                        tmon = npad(tdate.getMonth()+1, 2);
                                                        tday = npad(tdate.getDate(), 2);
                                                        thour = npad(tdate.getHours(), 2);
                                                        tmin = npad(tdate.getMinutes(), 2);
                                                        tsec = npad(tdate.getSeconds(), 2);
                                                        clipinfo.modifydate = ''+tyyyy+''+tmon+''+tday+''+thour+''+tmin+''+tsec;
                                                    }catch(err)
                                                    {
                                                       logger.error("[CJ] Error : parse modifydate error '"+clipinfo.modifydate+"' ");
                                                       no_error = false;
                                                    }
                                                }
                                                if(clipinfo.acquire === undefined) {
                                                    logger.error("[CJ] Error : No acquire");
                                                    no_error = false;
                                                }
                                                if(clipinfo.priority === undefined) {
                                                    logger.error("[CJ] Error : No priority");
                                                    no_error = false;
                                                }
                                                if(clipinfo.itemtypeid === undefined) {
                                                    logger.error("[CJ] Warning : No itemtypeid");
                                                    if(clipinfo.Itemtypeid === undefined) {
                                                        logger.error("[CJ] Warning : No Itemtypeid");
                                                        clipinfo.itemtypeid = '0';
                                                    } else {
                                                        clipinfo.itemtypeid = clipinfo.Itemtypeid;
                                                    }
                                                }else
                                                {
                                                    clipinfo.itemtypeid = clipinfo.itemtypeid.toString();
                                                }
                                                if(false == is_valid_number(clipinfo.playtime))
                                                {
                                                    clipinfo.playtime = 0;
                                                }else
                                                {
                                                    clipinfo.playtime = parseInt(clipinfo.playtime);
                                                }
                                                if(false == is_valid_number(clipinfo.starttime))
                                                {
                                                    clipinfo.starttime = 0;
                                                }else
                                                {
                                                    clipinfo.starttime = parseInt(clipinfo.starttime);
                                                }
                                                if(false == is_valid_number(clipinfo.endtime))
                                                {
                                                    clipinfo.endtime = 0;
                                                }else
                                                {
                                                    clipinfo.endtime = parseInt(clipinfo.endtime);
                                                }
                                                if(false == is_valid_number(clipinfo.targetage))
                                                {
                                                    clipinfo.targetage = 0;
                                                }else
                                                {
                                                    clipinfo.targetage = parseInt(clipinfo.targetage);
                                                }
                                                if(false == is_valid_data(clipinfo.cliptype)) {
                                                    clipinfo.cliptype = 'TZ';
                                                }
                                                if(false == is_valid_data(clipinfo.clipcategory)) {
                                                    clipinfo.clipcategory = '00';
                                                }
                                                if(false == is_valid_data(clipinfo.contentid)) {
                                                    clipinfo.contentid = clipinfo.clipid;
                                                }
                                                if(false == is_valid_data(clipinfo.programid)) {
                                                    clipinfo.programid = clipinfo.originid;
                                                }
                                                if(false == is_valid_data(clipinfo.programtitle)) {
                                                    clipinfo.programtitle = clipinfo.programid;
                                                }
                                                if(false == is_valid_number(clipinfo.cornerid)) {
                                                    clipinfo.cornerid = 0;
                                                }else
                                                {
                                                    clipinfo.cornerid = parseInt(clipinfo.cornerid);
                                                }
                                                if(false == is_valid(clipinfo.contenttitle)) {
                                                    clipinfo.contenttitle = clipinfo.contentid;
                                                }
                                                if(false == is_valid_number(clipinfo.cliporder)) {
                                                    clipinfo.cliporder = 0;
                                                }else
                                                {
                                                    clipinfo.cliporder = parseInt(clipinfo.cliporder);
                                                }
                                                if(false == is_valid_data(clipinfo.title)) {
                                                    clipinfo.title = main_cp_info.spid+"_"+clipinfo.clipid;
                                                }
                                                if(!no_error) {
                                                    // Data Error
                                                    // Data에 에러가 있는 경우 다음 Turn 으로 넘어간다
                                                     logger.error("[CJ] Error : Clip Data Error - SMS (ANALYTIC/CMS)");
                                                     var errorinfo = {
                                                         httpclip: clipinfo,
                                                         dbclip: null,
                                                         comment: 'Clip Data Error',
                                                         group: sms_group
                                                     };
                                                     //each_waterfall_callback(new Error('Clip Data Error - SMS'), clipinfo);
                                                     each_waterfall_callback(new Error('Clip Data Error - SMS'), errorinfo);
                                                } else {
                                                    // 다음 단계로
                                                    logger.debug("[CJ] ClipInfo Validate Success");
                                                    each_waterfall_callback(null);
                                                }
                                            },
                                            function(each_waterfall_callback) {
                                                // 필수 데이터 확인
                                                var pass = true;
                                                if(clipinfo.cpid === null || clipinfo.cpid === '') {
                                                    // 없는 경우 false
                                                    logger.error("[CJ] Error : Clip Data cpid not exist - SMS (ANALYTIC/CMS)");
                                                    pass = false;
                                                }
                                                if(clipinfo.clipid === null || clipinfo.clipid === '') {
                                                    // 없는 경우 false
                                                    logger.error("[CJ] Error : Clip Data clipid not exist - SMS (ANALYTIC/CMS)");
                                                    pass = false;
                                                }
                                                if(clipinfo.originid === null || clipinfo.originid === '') {
                                                    // 없는 경우 false
                                                    logger.error("[CJ] Error : Clip Data originid not exist - SMS (ANALYTIC/CMS)");
                                                    pass = false;
                                                }

                                                var notallowext = false;
                                                if(clipinfo.originurl === null || clipinfo.originurl === '') {
                                                    // 없는 경우 false
                                                    logger.error("[CJ] Error : Clip Data originurl not exist - SMS (ANALYTIC/CMS)");
                                                    pass = false;
                                                }
/*
확장자 체크 함
*/
                                                else {
                                                    // origin url에 있는 파일의 확장자 체크
                                                    var extdotindex = clipinfo.originurl.lastIndexOf('.');
                                                    var extension = clipinfo.originurl.slice(extdotindex+1, clipinfo.originurl.length).toLocaleLowerCase();
                                                    if(main_cp_info.allowextensions && main_cp_info.allowextensions.indexOf(extension) === -1) {
                                                        // 허용확장자가 아닌경우
                                                        logger.error("[CJ] Error : Not Allowed Extension (" + extension + ") - SMS (ANALYTIC/CMS)");
                                                        smscall('[acquire] [' + clipinfo.corporatorcode + '] not allowed extension (' + extension + ')', {group: sms_report }, null);
                                                        pass = false;
                                                        notallowext = true;
                                                    }
                                                }
//*/
                                                if(clipinfo.itemtypeid === null || clipinfo.itemtypeid === '') {
                                                    // 없는 경우 false
                                                    logger.error("[CJ] Error : Clip Data itemtypeid not exist - SMS (ANALYTIC/SMC)");
                                                    pass = false;
                                                }
                                                if(clipinfo.priority === null || clipinfo.priority === '') {
                                                    // 없는 경우 false
                                                    logger.error("[CJ] Error : Clip Data priority not exist - SMS (ANALYTIC/CMS)");
                                                    pass = false;
                                                }
                                                if(clipinfo.regdate === null || clipinfo.regdate === '') {
                                                    // 없는 경우 false
                                                    logger.error("[CJ] Error : Clip Data regdate not exist - SMS (ANALYTIC/CMS)");
                                                    pass = false;
                                                }

                                                if(!pass) {
                                                    // 에러로 빠지면서 스킵
                                                     var errorinfo = {
                                                         httpclip: clipinfo,
                                                         dbclip: null,
                                                         comment: 'clip data error',
                                                         group: sms_group
                                                     };

                                                     if(notallowext) {
                                                         errorinfo.comment = 'mediafile format error';
                                                     }
                                                     //smscall('[acquire] CMS CLIPINFO Clip Data Error..missing field', {group: sms_group}, null);
                                                     each_waterfall_callback(new Error('Clip Data Error'), errorinfo); // Changed 20150330
                                                } else {
                                                    // 다음진행
                                                    each_waterfall_callback(null);
                                                }
                                            },
                                            function(each_waterfall_callback) {
                                                if(clipinfo.acquire !== 'N' && clipinfo.acquire !== 'n') {
                                                    // Acquire가 N이 아닌것은 건너뛴다
                                                    logger.debug("[CJ] acquire not 'N' or 'n' ... Skipping ");
                                                     var errorinfo = {
                                                         httpclip: clipinfo,
                                                         dbclip: null,
                                                         comment: 'Acquire not N',
                                                         group: sms_admin_group
                                                     };
                                                    each_waterfall_callback(new Error('Acquire not N'), errorinfo); // Changed 20150330
                                                } else {
                                                    // 다음으로 진행
                                                    each_waterfall_callback(null);
                                                }
                                            },
                                            function(each_waterfall_callback) {
                                                // DB Connection 가져오기
                                                getDBConnection('CJ', function(err, dbConnection) {
                                                    if(err) {
                                                        // DB연결을 실패하여 Waterfall 에서 나가면서 Error 처리를 하고 다음 clipinfo 처리로 넘긴다
                                                        logger.error("[CJ] All DB Connection Fail - SMS (ANALYTIC)");
                                                        smscall("[acquire] DB Connection Fail", {group: sms_admin_group }, null);
                                                        var errorinfo = {
                                                            httpclip: clipinfo,
                                                            dbclip: null,
                                                            comment: 'Acquire error',
                                                            group: sms_admin_group
                                                        };
                                                        each_waterfall_callback(new Error("DB Connection Fail"), errorinfo);    // Changed 20150330
                                                    } else {
                                                        // DB연결을 가져오면 다음단계로 간다
                                                        logger.debug("[CJ] Get DB Connection Success");
                                                        each_waterfall_callback(null, dbConnection);
                                                    }
                                                });
                                            },
                                            function(db_connection, each_waterfall_callback) {
                                                // Download URL 생성
                                                // 1. clipinfo 수신데이터에 있는 cpid로 부터 T_CP_INFO에 있는 CP정보를 가져온다
                                                var cpid = clipinfo.cpid;
                                                //var sql_query = 'SELECT * FROM T_CP_INFO WHERE cpid=\'' + cpid + '\' limit 1;';
                                                var sql_query = "SELECT * FROM T_CP_INFO WHERE cpid='" + cpid + "' AND spid='"+main_cp_info.spid+"' limit 1;";

                                                logger.debug('[CJ] ' + sql_query);
                                                db_connection.query(sql_query, function(err, result) {
                                                    if(err) {
                                                        // Query 실패시 DB연결을 끊고 waterfall 을 빠져나가면서 Error 처리를 한다
                                                        db_connection.release();
                                                        logger.error("[CJ] DB Select Query from T_CP_INFO Fail - SMS (ANALYTIC)" );
                                                        var errorinfo = {
                                                            httpclip: clipinfo,
                                                            dbclip: null,
                                                            comment: 'Acquire error',
                                                            group: sms_admin_group
                                                        };
                                                        each_waterfall_callback(new Error("DB Select Query from T_CP_INFO Fail - SMS (ANALYTIC)"), errorinfo); // Changed 20150330
                                                        return;
                                                    } else {
                                                        // 성공 - 다음으로 진행
                                                        if(result.length <= 0) {
                                                            // 결과가 없는 경우
                                                            // 이 경우는 해당하는 CP가 없는 clip 이므로 에러처리하고 waterfall 빠져나간다
                                                            db_connection.release();
                                                            logger.error("[CJ] No CPINFO for cpid=" + cpid + " - SMS (ANALYTIC)");
                                                            var errorinfo = {
                                                                httpclip: clipinfo,
                                                                dbclip: null,
                                                                comment: 'Acquire error',
                                                                group: sms_admin_group
                                                            };
                                                            each_waterfall_callback(new Error("No CP INFO for cpid=" + cpid + " - SMS (ANALYTIC)"), errorinfo); // Changed 20150330
                                                            return;
                                                        } else {
                                                            // 결과가 있기 때문에 결과를 가지고 다음 단계로 진입한다
                                                            // result가 Query 결과임
                                                            logger.debug("[CJ] Get CP Data from T_CP_INFO Success" + cpid);
                                                            each_waterfall_callback(null, db_connection, result);
                                                            return;
                                                        }
                                                    }
                                                });
                                            },
                                            function(db_connection, cpinfo, each_waterfall_callback) {
                                                // clipinfo 수신데이터의 originurl과 cp 정보의 source_path를 조합하여 downloadurl을 생성한다
                                                if(clipinfo.downloadurl !== undefined && clipinfo.downloadurl !== null && clipinfo.downloadurl !== '') {
                                                    // http:// 로 시작하는 절대 경로
                                                    downloadurl = clipinfo.downloadurl;
                                                } else {
                                                    // 통상의 다운로드 URL
                                                    /*
                                                    if(clipinfo.originurl.indexOf('/') === 0) {
                                                        downloadurl = cpinfo[0].source_path + clipinfo.originurl;
                                                    } else {
                                                        downloadurl = cpinfo[0].source_path + '/' + clipinfo.originurl;
                                                    }
                                                    */
                                                    if(clipinfo.originurl.indexOf('/') !== 0) {
                                                        // Adding Slash
                                                        logger.debug("[CJ] abnormal originurl - Adding / to clipinfo.originurl =" + clipinfo.originurl);
                                                        clipinfo.originurl = '/' + clipinfo.originurl;
                                                    } else {
                                                        logger.debug("[CJ] originurl is normal");
                                                    }
                                                    downloadurl = cpinfo[0].source_path + clipinfo.originurl;
                                                }

                                                logger.debug("[CJ] DownloadURL=" + downloadurl);

                                                // mediaurl을 파싱한다
                                                if(clipinfo.mediaurl === null || clipinfo.mediaurl === '') {
                                                    // 신규버전
                                                    http_clipinfo_version = 1;
                                                } else {
                                                    // 업데이트 버전
                                                    var pathlist = clipinfo.mediaurl.split('/');
                                                    var filename = pathlist[pathlist.length-1];
                                                    var filenamesplit = filename.split('_') ;
                                                    var versionstring = '';
                                                    var index = -1;
                            
                                                    if(2 < filenamesplit.length)
                                                    {
                                                        versionstring = filenamesplit[filenamesplit.length-2];
                                                        logger.debug("[CJ] Version String = " + versionstring);
                                                        index = versionstring.indexOf('v');
                                                        if(index !== 0) {
                                                            index = versionstring.indexOf('V');
                                                        }
                                                    }else
                                                    {
                                                        logger.debug("[CJ] Version String not found ");
                                                    }
                                                    //if(index === -1) {
                                                    //    index = versionstring.indexOf('V');
                                                    //}
                                                    if(main_cp_info.disable_version !== undefined && main_cp_info.disable_version === 'Y')
                                                    {
                                                        // 버전정보가 없는 경우 에러처리
                                                        logger.debug("[CJ] No Version String Version=1");
                                                        http_clipinfo_version = 1;
                                                    }else if(index !== 0) {
                                                        // 버전정보가 없는 경우 에러처리
                                                        logger.debug("[CJ] No Version String Version=2");
                                                        http_clipinfo_version = 2;
                                                    } else {
                                                        http_clipinfo_version = parseInt(versionstring.substring(index + 1, versionstring.length)) + 1;
                                                    }
                                                }
                                                logger.debug("[CJ] HTTP ClipInfo Version =" + http_clipinfo_version);
                                                // 다음 단계로 진입한다
                                                each_waterfall_callback(null, db_connection, cpinfo);
                                            },
                                            function(db_connection, cpinfo, each_waterfall_callback) {
                                                var sql_query = "SELECT * FROM T_JOB WHERE clipid='" + clipinfo.clipid + "' AND spid='"+cpinfo[0].spid+"' order by version_id desc, create_date desc limit 1;";
                                                logger.debug('[CJ] ' + sql_query);
                                                db_connection.query(sql_query, function(err, result) {
                                                    if(err) {
                                                        db_connection.release();
                                                        logger.error("[CJ] DB Select Query Fail - SMS (ANALYTIC)");
                                                        var errorinfo = {
                                                            httpclip: clipinfo,
                                                            dbclip: null,
                                                            comment: 'Acquire error',
                                                            group: sms_admin_group
                                                        };
                                                        each_waterfall_callback(new Error("DB Select Query Fail - SMS (ANALYTIC)"), errorinfo); // 20150330
                                                    } else {
                                                        each_waterfall_callback(null, db_connection, cpinfo, result);
                                                    }
                                                });
                                            },

                                            function(db_connection, cpinfo, jobresult, each_waterfall_callback) {
                                                // 중복 Job 처리
                                                // 수신된 clipinfo에서 clipid 값을 가지고 T_CLIP_INFO에 중복되어 있는 레코드가 있는지 확인한다
                                                var sql_query = "SELECT * FROM T_CLIP_INFO WHERE clipid='" + clipinfo.clipid + "' AND spid='"+cpinfo[0].spid+"' limit 1;";
                                                logger.debug('[CJ] ' + sql_query);
                                                db_connection.query(sql_query, function(err, result) {
                                                    if(err) {
                                                        db_connection.release();
                                                        logger.error("[CJ] DB Select Query Fail - SMS (ANALYTIC)");
                                                        var errorinfo = {
                                                            httpclip: clipinfo,
                                                            dbclip: null,
                                                            comment: 'Acquire error',
                                                            group: sms_admin_group
                                                        };
                                                        each_waterfall_callback(new Error("DB Select Query Fail - SMS (ANALYTIC)"), errorinfo); // 20150330
                                                    } else {
                                                        // 성공 - 다음으로 진행
                                                        if(result.length <= 0) {
                                                            // 결과가 없는 경우
                                                            // 신규로 진행한다
                                                            logger.debug("[CJ] New Clip - Select HTTP ClipInfo Version");
                                                            version = http_clipinfo_version.toString();
                                                            //version = http_clipinfo_version;
                                                            logger.debug("[CJ] ###6 Check Version Info = " + version);
                                                            each_waterfall_callback(null, db_connection, cpinfo, false, false);
                                                        } else {
                                                            // 중복레코드가 있는 경우
                                                            var skipping = true;
                                                            var db_clipinfo = result[0];
                                                            //
                                                            if(db_clipinfo.originurl !== clipinfo.originurl) {
                                                                logger.debug("[CJ] originurl changed force to work");
                                                                if((main_cp_info.disable_version === undefined || main_cp_info.disable_version !== 'Y') && jobresult.length > 0) {
                                                                    if(db_clipinfo_version === undefined || db_clipinfo_version === null) {
                                                                        db_clipinfo_version = 1;
                                                                    } else {
                                                                        db_clipinfo_version = parseInt(jobresult[0].version_id) + 1;
                                                                    }
                                                                } else {
                                                                    db_clipinfo_version = 1;
                                                                }
                                                                version = db_clipinfo_version.toString();
                                                                logger.debug("[CJ] ###7 Check Version Info = " + version);
                                                                each_waterfall_callback(null, db_connection, cpinfo, false, true);
                                                                return;
                                                            }

                                                            logger.debug("[CJ] db_clipinfo.mediaurl=" + db_clipinfo.mediaurl);
                                                            if(db_clipinfo.mediaurl === null || db_clipinfo.mediaurl === '') {
                                                                // --> 신규로 중복되는 경우 현재 acquire 상태를 본다 혹시 F 상태인 경우 강제로 JOB을 할당하도록 한다
                                                                if(db_clipinfo.acquire.toUpperCase() === 'F') {
                                                                    // 강제로 JOB을 할당하도록 한다
                                                                    logger.debug("[CJ] Previous Fail Clip..Force to work");
                                                                    if((main_cp_info.disable_version === undefined || main_cp_info.disable_version !== 'Y') && jobresult.length > 0) {
                                                                        if(db_clipinfo_version === undefined || db_clipinfo_version === null) {
                                                                            db_clipinfo_version = 1;
                                                                        } else {
                                                                            db_clipinfo_version = parseInt(jobresult[0].version_id) + 1;
                                                                        }
                                                                    } else {
                                                                        db_clipinfo_version = 1;
                                                                    }
                                                                    version = db_clipinfo_version.toString();
                                                                    logger.debug("[CJ] ###5 Check Version Info = " + version);
                                                                    each_waterfall_callback(null, db_connection, cpinfo, false, true);
                                                                } else {
                                                                    // 만일 originurl 이 변경되었다면 강제로 JOB을 할당한다
                                                                    skipping = true;
                                                                    db_connection.release();
                                                                    logger.error("[CJ] New Clip Duplicated ... Skipping clipid=" + db_clipinfo.clipid + " - SMS (ANALYTIC)");
                                                                    var errorinfo = {
                                                                        httpclip: clipinfo,
                                                                        dbclip: db_clipinfo,
                                                                        comment: 'require duplicated',
                                                                        group: sms_group
                                                                    };
                                                                    each_waterfall_callback(new Error("New Clip Duplicated - SMS (ANALYTIC)"), errorinfo); // Change 20150330
                                                                    //eachseries_callback(null);
                                                                }
                                                            } else {
                                                                // HTTP 파일 체크
                                                                // 여기서 content-length와 last-modified를 확인한다
                                                                // 만일 같은 경우 그냥 완료보고를 한다
                                                                async.retry(3, function(retrytaskcallback, retrytaskresult){
                                                                    // Retry Task
                                                                    logger.debug("Check HTTP HEAD...URL=" + downloadurl);
                                                                    request.head({
                                                                        url: downloadurl,
                                                                        timeout: 10000
                                                                    },
                                                                    function(request_err, response, body) {
                                                                        if(request_err || response.statusCode !== 200) {
                                                                            // HTTP 오류시 건너뛰기
                                                                            // 2초후에 Retry 시도를 한다
                                                                            if(request_err) {
                                                                                setTimeout(function() {
                                                                                    retrytaskcallback(request_err, null);
                                                                                }, 2000);
                                                                            } else {
                                                                                setTimeout(function() {
                                                                                    retrytaskcallback(new Error(response.statusCode), null);
                                                                                }, 2000);
                                                                            }
                                                                        } else {
                                                                            retrytaskcallback(null, response);
                                                                        }
                                                                    });
                                                                }, function(err, finalresult){
                                                                    // Success or Final Fail
                                                                    if(err) {
                                                                        // 3번 다돌았는데도 오류발생
                                                                        skipping = true;
                                                                        db_connection.release();
                                                                        logger.error("[CJ] HTTP HEAD Request Error....Skipping - SMS (ANALYTIC)");
                                                                        var errorinfo = {
                                                                            httpclip: clipinfo,
                                                                            dbclip: db_clipinfo,
                                                                            comment: 'originurl cannot check',
                                                                            group: sms_admin_group
                                                                        };
                                                                        each_waterfall_callback(new Error("HTTP HEAD Request Error - SMS (ANALYTIC)"), errorinfo);  // 20150330
                                                                    } else {
                                                                        // 성공
                                                                        // HTTP HEAD Receive 성공
                                                                        logger.error("[CJ] finalresult=" + JSON.stringify(finalresult));
                                                                        var response = finalresult;
                                                                        if(response === null || response === undefined) {
                                                                            // 데이터 오류발생
                                                                            // Skipping
                                                                            skipping = true;
                                                                            db_connection.release();
                                                                            logger.error("[CJ] HTTP HEAD no response....Skipping - SMS (ANALYTIC)");
                                                                            var errorinfo = {
                                                                                httpclip: clipinfo,
                                                                                dbclip: db_clipinfo,
                                                                                comment: 'originurl cannot check',
                                                                                group: sms_admin_group

                                                                            };
                                                                            each_waterfall_callback(new Error("[CJ] HTTP HEAD no response....Skipping - SMS (ANALYTIC)"), errorinfo); // 20150330
                                                                            return;
                                                                        }
                                                                        var headers = response.headers;
                                                                        var content_length = headers["content-length"];
                                                                        var last_modified = headers["last-modified"];
                                                                        if(content_length === undefined || last_modified === undefined || content_length === null || last_modified === null || content_length === '' || last_modified === '') {
                                                                            // Data 오류
                                                                            // 건너뛰기
                                                                            skipping = true;
                                                                            db_connection.release();
                                                                            logger.error("[CJ] HTTP HEAD not contain content-length & last-modified Error....Skipping - SMS (ANALYTIC)");
                                                                            var errorinfo = {
                                                                                httpclip: clipinfo,
                                                                                dbclip: db_clipinfo,
                                                                                comment: 'originurl cannot check',
                                                                                group: sms_admin_group
                                                                            };
                                                                            each_waterfall_callback(new Error("HTTP HEAD not received HTTP content-length & last-modified - SMS (ANALYTIC)"), errorinfo);   // 20150330
                                                                            return;
                                                                        } else if(db_clipinfo.content_length === null || db_clipinfo.last_modified === null || db_clipinfo.content_length === '' || db_clipinfo.last_modified === '') {
                                                                            // Data 오류
                                                                            // 건너뛰기
                                                                            skipping = true;
                                                                            db_connection.release();
                                                                            logger.error("[CJ] HTTP HEAD not contain content-length & last-modified Error....Skipping - SMS (ANALYTIC)");
                                                                            var errorinfo = {
                                                                                httpclip: clipinfo,
                                                                                dbclip: db_clipinfo,
                                                                                comment: 'originurl cannot check',
                                                                                group: ['sd_smc_acquire']
                                                                            };
                                                                            each_waterfall_callback(new Error("Can't check received HTTP content-length & last-modified - SMS (ANALYTIC)"), errorinfo);   // 20150330
                                                                            return;
                                                                        } else {
                                                                            // 비교한다
                                                                            logger.debug("[CJ] C/C = " + content_length + "/" + db_clipinfo.content_length);
                                                                            logger.debug("[CJ] L/L = " + last_modified + "/" + db_clipinfo.last_modified);

                                                                            if(content_length.toString() === db_clipinfo.content_length.toString() && last_modified.toString() === db_clipinfo.last_modified.toString()) {
                                                                                logger.debug("[CJ] Just Already Downloaded So Report Process");
                                                                                // 같은 경우 완료보고만 하고 넘어간다
                                                                                var report_form = {
                                                                                    clipid: clipinfo.originid,
                                                                                    acquire: "Y",
                                                                                    comment: "Clip Already Downloaded",
                                                                                    mediaurl: db_clipinfo.mediaurl,
                                                                                    playtime: db_clipinfo.playtime,
                                                                                    itemtypeid: db_clipinfo.itemtypeid
                                                                                };

                                                                                if(jobresult.length > 0) {
                                                                                    logger.debug("[CJ] Use JOB Data");
                                                                                    report_form.playtime = jobresult[0].playtime;
                                                                                    report_form.itemtypeid = jobresult[0].itemtypeid;
                                                                                }
                                                                                logger.debug("[CJ] Report Form = " + JSON.stringify(report_form));
                                                                                logger.debug("[CJ] Progress report Start : " + main_cp_info.report_url);

                                                                                // reporter api 호출
                                                                                report_result(main_cp_info.report_url, report_form, function(request_err, response, body) {
                                                                                    if(request_err || response.statusCode !== 200) {
                                                                                        skipping = true;
                                                                                        db_connection.release();
                                                                                        logger.error("[CJ] Error : " + request_err + " - SMS (ANALYTIC)");
                                                                                        if(!clipacquirereport_api_error[main_cp_info.spid]) {
                                                                                            // error발생상황이 아니었던 경우 SMS 발송을 하고 상태를 error 상태로 바꾼다
                                                                                            clipacquirereport_api_error[main_cp_info.spid] = true;
                                                                                            smscall('[api] clipacquirereport http error', {group: sms_group }, null);
                                                                                        }

                                                                                        //smscall('[api] ' + clipinfo.corporatorcode + ' ' + clipinfo.originid + ' clipacquirereport http error', {group: sms_group }, null);

                                                                                        var errorinfo = {
                                                                                            httpclip: clipinfo,
                                                                                            dbclip: db_clipinfo,
                                                                                            comment: 'CMS Server Error',
                                                                                            group: sms_group
                                                                                        };
                                                                                        each_waterfall_callback(new Error('No Job ClipInfo Report HTTP Error - SMS (ANALYTIC)'), errorinfo); // 20150330
                                                                                    } else {
                                                                                        // HTTP POST Receive 성공
                                                                                        // 다음 작업으로 넘어간다
                                                                                        skipping = true;
                                                                                        db_connection.release();
                                                                                        logger.debug("[CJ] No Job Complete Report Success : " + body);
                                                                                        if(clipacquirereport_api_error[main_cp_info.spid]) {
                                                                                            // error발생상황이 아니었던 경우 SMS 발송을 하고 상태를 error 상태로 바꾼다
                                                                                            clipacquirereport_api_error[main_cp_info.spid] = false;
                                                                                            smscall('[api] clipacquirereport http OK', {group: sms_group }, null);
                                                                                        }

                                                                                        // GET을 통한 status 확인만 하는 로직 2015-07-08 18:12 #2
                                                                                        var request_form = {
                                                                                            cpid: main_cp_info.cpid,
                                                                                            clipid: report_form.originid,
                                                                                            type: 'recent',
                                                                                            acquire: ''
                                                                                        };

                                                                                        // request api 호출
                                                                                        function cb_gethttpgetretry(err, result)
                                                                                        {
                                                                                            if(err)
                                                                                            {
                                                                                                logger.error("[CJ] Verify Error : " + err + " SMS (ANALYTIC)");
//                                                                                                smscall('[api] ' + main_cp_info.name + ' clipacquirelist http error', {group: sms_admin_group }, null);
                                                                                            }else
                                                                                            {
                                                                                                logger.debug("[CJ] Verify Success : " + result.body);
                                                                                            }
                                                                                            eachseries_callback(null);
                                                                                        }
                                                                                        gethttpgetretry(main_cp_info.request_url, request_form, 120000, 3, cb_gethttpgetretry);

                                                                                        //
                                                                                        // 성공한경우 이전 error 상태를 확인해서 error를 복구했다고 SMS 전송
                                                                                        //if(clipacquirereport_api_error) {
                                                                                        //    // error발생상황이 아니었던 경우 SMS 발송을 하고 상태를 error 상태로 바꾼다
                                                                                        //    clipacquirereport_api_error = false;
                                                                                        //    smscall('[api] clipacquirereport http OK', {group: sms_group }, null);
                                                                                        //}

                                                                                        //eachseries_callback(null);
                                                                                    }
                                                                                });
                                                                            } else {
                                                                                // 다른 경우는 버전정보를 확인하는 작업을 한다
                                                                                // Version 체크
                                                                                var pathlist = db_clipinfo.mediaurl.split('/');
                                                                                var filename = pathlist[pathlist.length-1];
                                                                                var filenamesplit = filename.split('_') ;
                                                                                var versionstring = '';
                                                                                var index = -1;

// 파일명이 'v' 또는 'V'로 시작할 경우 예외처리 start
                                                                                if(2 < filenamesplit.length)
                                                                                {
                                                                                    versionstring = filenamesplit[filenamesplit.length-2];
                                                                                    logger.debug("[CJ] Version String = " + versionstring);

                                                                                    index = versionstring.indexOf('v');
                                                                                    if(index !== 0) {
                                                                                        index = versionstring.indexOf('V');
                                                                                    }
                                                                                }else
                                                                                {
                                                                                    logger.debug("[CJ] Version String not found ");
                                                                                }
// 파일명이 'v' 또는 'V'로 시작할 경우 예외처리 end
                                                                                if(main_cp_info.disable_version !== undefined && main_cp_info.disable_version === 'Y')
                                                                                {
                                                                                    // 버전정보가 없는 경우 에러처리
                                                                                    logger.debug("[CJ] No Version String Version=1");
                                                                                    //version = '2';
                                                                                    db_clipinfo_version = 1;
                                                                                }else if(index !== 0)
                                                                                {
                                                                                    // 버전정보가 없는 경우 에러처리
                                                                                    logger.debug("[CJ] No Version String Version=2");
                                                                                    //version = '2';
                                                                                    db_clipinfo_version = 2;
                                                                                    //each_waterfall_callback(new Error("No Version String - SMS"), null);
                                                                                } else {
                                                                                    db_clipinfo_version = parseInt(versionstring.substring(index + 1, versionstring.length)) + 1;
                                                                                    logger.debug("[CJ] Version Checked = " + db_clipinfo_version);
                                                                                }
                                                                                version = db_clipinfo_version.toString();
                                                                                logger.debug("[CJ] ###3 Check Version Info = " + version);
                                                                                skipping = false;
                                                                                if(!skipping) {
                                                                                        logger.debug("[CJ] DB ClipInfo Version=" + db_clipinfo_version);
                                                                                        // db_clipinfo_version > http_clipinfo_version
                                                                                        // 이 경우는 그냥 완료보고만 하도록 한다
                                                                                        // http_clipinfo_version 다시계산
                                                                                        // 2015-07-08 긴급패치 jhkim
                                                                                        // clipinfo.mediaurl 이 null 혹은 '' 일때 처리 추가
                                                                                        if(clipinfo.mediaurl !== null && clipinfo.mediaurl !== '') {
                                                                                            var pathlist_http = clipinfo.mediaurl.split('/');
                                                                                            var filename_http = pathlist_http[pathlist_http.length-1];
                                                                                            var filenamesplit_http = filename_http.split('_') ;
                                                                                            var versionstring_http = '';
                                                                                            var index_http = -1;

                                                                                            if(2 < filenamesplit_http.length)
                                                                                            {
                                                                                                versionstring_http = filenamesplit_http[filenamesplit_http.length-2];
                                                                                                logger.debug("[CJ] HTTP Mediaurl Version String = " + versionstring_http);

                                                                                                index_http = versionstring_http.indexOf('v');
                                                                                                if(index_http !== 0) {
                                                                                                    index_http = versionstring_http.indexOf('V');
                                                                                                }
                                                                                            }else
                                                                                            {
                                                                                                logger.debug("[CJ] Version String not found ");
                                                                                            }
                                                                                            if(main_cp_info.disable_version !== undefined && main_cp_info.disable_version === 'Y')
                                                                                            {
                                                                                                // 버전정보가 없는 경우 에러처리
                                                                                                logger.debug("[CJ] No Version String Version=1");
                                                                                                //version = '2';
                                                                                                http_clipinfo_version = 1;
                                                                                            }else if(index_http !== 0) {
                                                                                                // 버전정보가 없는 경우 에러처리
                                                                                                logger.debug("[CJ] No Version String Version=2");
                                                                                                //version = '2';
                                                                                                http_clipinfo_version = 2;
                                                                                                //each_waterfall_callback(new Error("No Version String - SMS"), null);
                                                                                            } else {
                                                                                                http_clipinfo_version = parseInt(versionstring_http.substring(index_http + 1, versionstring_http.length)) + 1;
                                                                                                logger.debug("[CJ] clipinfo mediaurl Version Checked = " + http_clipinfo_version);
                                                                                            }
                                                                                        } else {
                                                                                            // mediaurl 이 없거나 null 인경우 신규로 간주
                                                                                            http_clipinfo_version = 1;
                                                                                        }
                                                                                        ///////////////////// 2015-07-08 긴급패치
                                                                                        //
                                                                                        if(db_clipinfo_version > http_clipinfo_version) {
                                                                                            // 그냥 완료보고
                                                                                            logger.debug("[CJ] HTTP Clipinfo("+http_clipinfo_version+") is lower version ("+db_clipinfo_version+").. Report Done");
                                                                                            // 진행상황 보고
                                                                                            var report_form = {
                                                                                                clipid: clipinfo.originid,
                                                                                                acquire: "Y",
                                                                                                comment: "Clip Already Downloaded",
                                                                                                mediaurl: db_clipinfo.mediaurl,
                                                                                                playtime: db_clipinfo.playtime,
                                                                                                itemtypeid: db_clipinfo.itemtypeid
                                                                                            };

                                                                                            if(jobresult.length > 0) {
                                                                                                logger.debug("[CJ] Use JOB Data");
                                                                                                report_form.playtime = jobresult[0].playtime;
                                                                                                report_form.itemtypeid = jobresult[0].itemtypeid;
                                                                                            }
                                                                                            logger.debug("[CJ] Report Form = " + JSON.stringify(report_form));
                                                                                            logger.debug("[CJ] Progress report Start : " + main_cp_info.report_url);

                                                                                            // reporter api 호출
                                                                                            report_result(main_cp_info.report_url, report_form, function(request_err, response, body) {
                                                                                                if(request_err || response.statusCode !== 200) {
                                                                                                    logger.error("[CJ] Error : " + request_err + " - SMS (ANALYTIC)");
                                                                                                    if(!clipacquirereport_api_error[main_cp_info.spid]) {
                                                                                                        // error발생상황이 아니었던 경우 SMS 발송을 하고 상태를 error 상태로 바꾼다
                                                                                                        clipacquirereport_api_error[main_cp_info.spid] = true;
                                                                                                        smscall('[api] clipacquirereport http error', {group: sms_group }, null);
                                                                                                    }

                                                                                                    //smscall('[api] ' + clipinfo.corporatorcode + ' ' + clipinfo.originid + ' clipacquirereport http error', {group: sms_group }, null);
                                                                                                    db_connection.release();
                                                                                                    var errorinfo = {
                                                                                                        httpclip: clipinfo,
                                                                                                        dbclip: db_clipinfo,
                                                                                                        comment: 'CMS Server Error',
                                                                                                        group: sms_group
                                                                                                    };
                                                                                                    each_waterfall_callback(new Error('No Job ClipInfo Report HTTP Error - SMS (ANALYTIC)'), errorinfo); // 20150330
                                                                                                } else {
                                                                                                    // HTTP POST Receive 성공
                                                                                                    // 다음 작업으로 넘어간다
                                                                                                    db_connection.release();
                                                                                                    logger.debug("[CJ] No Job Complete Report Success : " + body);
                                                                                                    // 성공한경우 이전 error 상태를 확인해서 error를 복구했다고 SMS 전송
                                                                                                    if(clipacquirereport_api_error[main_cp_info.spid]) {
                                                                                                        // error발생상황이 아니었던 경우 SMS 발송을 하고 상태를 error 상태로 바꾼다
                                                                                                        clipacquirereport_api_error[main_cp_info.spid] = false;
                                                                                                        smscall('[api] clipacquirereport http OK', {group: sms_group }, null);
                                                                                                    }
                                                                                                    // 한번더 확인한다 2015-07-08 #2
                                                                                                    var request_form = {
                                                                                                        cpid: main_cp_info.cpid,
                                                                                                        clipid: report_form.originid,
                                                                                                        type: 'recent',
                                                                                                        acquire: ''
                                                                                                    };

                                                                                                    // request api 호출
                                                                                                    function cb_gethttpgetretry(err, result)
                                                                                                    {
                                                                                                        if(err)
                                                                                                        {
                                                                                                            logger.error("[CJ] Verify Error : " + err + " SMS (ANALYTIC)");
//                                                                                                            smscall('[api] ' + main_cp_info.name + ' clipacquirelist http error', {group: sms_admin_group }, null);
                                                                                                        }else
                                                                                                        {
                                                                                                            logger.debug("[CJ] Verify Success : " + result.body);
                                                                                                        }
                                                                                                        eachseries_callback(null);
                                                                                                    }
                                                                                                    gethttpgetretry(main_cp_info.request_url, request_form, 120000, 1, cb_gethttpgetretry);

                                                                                                    //eachseries_callback(null);
                                                                                                }
                                                                                            });
                                                                                        }else if(main_cp_info.disable_version !== undefined && main_cp_info.disable_version === 'Y')
                                                                                        {
                                                                                            // 이 경우는 버전을 항항 1로 고정한다.
                                                                                            logger.debug("[CJ] HTTP Clipinfo is newer version .. Do Working but use version 1");
                                                                                            version = '1';
                                                                                            logger.debug("[CJ] ###2 Check Version Info = " + version);
                                                                                            //version = http_clipinfo_version;
                                                                                            each_waterfall_callback(null, db_connection, cpinfo, true, true);
                                                                                        } else
                                                                                        {
                                                                                            // 이 경우는 http_clipinfo_version 으로 버전을 갱신하고 작업을 수행하도록 한다
                                                                                            logger.debug("[CJ] HTTP Clipinfo is newer version .. Do Working");
                                                                                            version = http_clipinfo_version.toString();
                                                                                            logger.debug("[CJ] ###2 Check Version Info = " + version);
                                                                                            //version = http_clipinfo_version;
                                                                                            each_waterfall_callback(null, db_connection, cpinfo, true, true);
                                                                                        }
                                                                                 }
                                                                            }
                                                                        }
                                                                    }
                                                                });
                                                            }
                                                        }
                                                    }
                                                });
                                            },
                                            function(db_connection, cpinfo, skip, dbupdate, each_waterfall_callback) {
                                                logger.debug("[CJ] ###1 Check Version Info = " + version);
                                                if(!skip) {
                                                    // 신규등록
                                                    // 만일 acquire가 없는 경우 N으로 설정한다
                                                    if(clipinfo.acquire === '') {
                                                        clipinfo.acquire = 'N';
                                                    }
                                                    var sql_query = '';
                                                    if(!dbupdate) {
                                                        // DB Insert
                                                        logger.debug("[CJ] New Clip Inserted");
                                                        sql_query = 'INSERT INTO T_CLIP_INFO ';
                                                        sql_query += '(programid, programtitle, spid, cpid, corporatorcode, contentid, cornerid, contenttitle, cliporder, clipid, originid, ';
                                                        sql_query += 'title, originurl, downloadurl, mediaurl, itemtypeid, cliptype, clipcategory, regdate, modifydate, playtime, starttime, endtime, targetage, acquire, priority) ';
                                                        sql_query += 'VALUES ';
                                                        sql_query += '(';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.programid) + '\', ';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.programtitle) + '\', ';
                                                        sql_query += '\'' + mysqlsinglequote(cpinfo[0].spid) + '\', ';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.cpid) + '\', ';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.corporatorcode) + '\', ';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.contentid) + '\', ';
                                                        sql_query += clipinfo.cornerid + ', ';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.contenttitle) + '\', ';
                                                        sql_query += clipinfo.cliporder + ', ';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.clipid) + '\', ';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.originid) + '\', ';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.title) + '\', ';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.originurl) + '\', ';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.downloadurl) + '\', ';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.mediaurl) + '\', ';
                                                        sql_query += clipinfo.itemtypeid + ', ';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.cliptype) + '\', ';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.clipcategory) + '\', ';
                                                        sql_query += '\'' + mysqlsinglequote(getdatetimestring(clipinfo.regdate)) + '\', ';
                                                        sql_query += '\'' + mysqlsinglequote(getdatetimestring(clipinfo.modifydate)) + '\', ';
                                                        sql_query += clipinfo.playtime + ', ';
                                                        sql_query += clipinfo.starttime + ', ';
                                                        sql_query += clipinfo.endtime + ', ';
                                                        sql_query += clipinfo.targetage + ', ';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.acquire) + '\', ';
                                                        sql_query += '\'' + mysqlsinglequote(clipinfo.priority) + '\'';
                                                        sql_query += ');';
                                                    } else {
                                                        logger.debug("[CJ] Exist Clip Updated");
                                                        // Update
                                                        sql_query += 'UPDATE T_CLIP_INFO set ';
                                                        sql_query += 'programid=\'' + mysqlsinglequote(clipinfo.programid) + '\', ';
                                                        sql_query += 'programtitle=\'' + mysqlsinglequote(clipinfo.programtitle) + '\', ';
                                                        sql_query += 'spid=\'' + mysqlsinglequote(cpinfo[0].spid) + '\', ';
                                                        sql_query += 'cpid=\'' + mysqlsinglequote(clipinfo.cpid) + '\', ';
                                                        sql_query += 'corporatorcode=\'' + mysqlsinglequote(clipinfo.corporatorcode) + '\', ';
                                                        sql_query += 'contentid=\'' + mysqlsinglequote(clipinfo.contentid) + '\', ';
                                                        sql_query += 'cornerid=' + clipinfo.cornerid + ', ';
                                                        sql_query += 'contenttitle=\'' + mysqlsinglequote(clipinfo.contenttitle) + '\', ';
                                                        sql_query += 'cliporder=' + clipinfo.cliporder + ', ';
                                                        sql_query += 'title=\'' + mysqlsinglequote(clipinfo.title) + '\', ';
                                                        sql_query += 'originurl=\'' + mysqlsinglequote(clipinfo.originurl) + '\', ';
                                                        sql_query += 'mediaurl=\'' + mysqlsinglequote(clipinfo.mediaurl) + '\', ';
                                                        sql_query += 'downloadurl=\'' + mysqlsinglequote(clipinfo.downloadurl) + '\', ';
                                                        sql_query += 'itemtypeid=' + clipinfo.itemtypeid + ', ';
                                                        sql_query += 'cliptype=\'' + mysqlsinglequote(clipinfo.cliptype) + '\', ';
                                                        sql_query += 'clipcategory=\'' + mysqlsinglequote(clipinfo.clipcategory) + '\', ';
                                                        sql_query += 'regdate=\'' + mysqlsinglequote(getdatetimestring(clipinfo.regdate)) + '\', ';
                                                        sql_query += 'modifydate=\'' + mysqlsinglequote(getdatetimestring(clipinfo.modifydate)) + '\', ';
                                                        sql_query += 'playtime=' + clipinfo.playtime + ', ';
                                                        sql_query += 'starttime=' + clipinfo.starttime + ', ';
                                                        sql_query += 'endtime=' + clipinfo.endtime + ', ';
                                                        sql_query += 'targetage=' + clipinfo.targetage + ', ';
                                                        sql_query += 'acquire=\'' + mysqlsinglequote(clipinfo.acquire) + '\', ';
                                                        sql_query += 'priority=\'' + mysqlsinglequote(clipinfo.priority) + '\' ';
                                                        sql_query += "WHERE clipid='" + mysqlsinglequote(clipinfo.clipid) + "' AND originid='" + mysqlsinglequote(clipinfo.originid) + "';";
                                                    }
                                                    logger.debug('[CJ] ' + sql_query);
                                                    db_connection.query(sql_query, function(err, result) {
                                                        if(err) {
                                                            db_connection.release();
                                                            logger.error("[CJ] DB Insert Query Fail : " + err + " - SMS (ANALYTIC)");
                                                            smscall('[acquire] ' + clipinfo.corporatorcode + ' clipid ' + clipinfo.clipid + ' DB Error Insert or Update T_CLIP_INFO', {group: sms_admin_group }, null);
                                                            var errorinfo = {
                                                                httpclip: clipinfo,
                                                                dbclip: null,
                                                                comment: 'Acquire Error',
                                                                group: sms_admin_group
                                                            };
                                                            each_waterfall_callback(new Error("DB Insert Query Fail - SMS (ANALYTIC)"), errorinfo);  // 20150330
                                                        } else {
                                                            // 성공 - 다음으로 진행
                                                            logger.debug("[CJ] T_CLIP_INFO Record Insert / Update Success");
                                                            each_waterfall_callback(null, db_connection, cpinfo);
                                                        }
                                                    });
                                                } else {
                                                    // 건너뛰고 다음으로 진행
                                                    // DB 업데이트
                                                    if(dbupdate) {
                                                        // CLIPINFO UPDATE
                                                        logger.debug("[CJ] T_CLIP_INFO Updating");
                                                        var sql_query = '';
                                                        // Update
                                                        sql_query += 'UPDATE T_CLIP_INFO set ';
                                                        sql_query += 'programid=\'' + mysqlsinglequote(clipinfo.programid) + '\', ';
                                                        sql_query += 'programtitle=\'' + mysqlsinglequote(clipinfo.programtitle) + '\', ';
                                                        sql_query += 'spid=\'' + mysqlsinglequote(cpinfo[0].spid) + '\', ';
                                                        sql_query += 'cpid=\'' + mysqlsinglequote(clipinfo.cpid) + '\', ';
                                                        sql_query += 'corporatorcode=\'' + mysqlsinglequote(clipinfo.corporatorcode) + '\', ';
                                                        sql_query += 'contentid=\'' + mysqlsinglequote(clipinfo.contentid) + '\', ';
                                                        sql_query += 'cornerid=' + clipinfo.cornerid + ', ';
                                                        sql_query += 'contenttitle=\'' + mysqlsinglequote(clipinfo.contenttitle) + '\', ';
                                                        sql_query += 'cliporder=' + clipinfo.cliporder + ', ';
                                                        sql_query += 'title=\'' + mysqlsinglequote(clipinfo.title) + '\', ';
                                                        sql_query += 'originurl=\'' + mysqlsinglequote(clipinfo.originurl) + '\', ';
                                                        sql_query += 'mediaurl=\'' + mysqlsinglequote(clipinfo.mediaurl) + '\', ';
                                                        sql_query += 'downloadurl=\'' + mysqlsinglequote(clipinfo.downloadurl) + '\', ';
                                                        sql_query += 'itemtypeid=' + clipinfo.itemtypeid + ', ';
                                                        sql_query += 'cliptype=\'' + mysqlsinglequote(clipinfo.cliptype) + '\', ';
                                                        sql_query += 'clipcategory=\'' + mysqlsinglequote(clipinfo.clipcategory) + '\', ';
                                                        sql_query += 'regdate=\'' + mysqlsinglequote(getdatetimestring(clipinfo.regdate)) + '\', ';
                                                        sql_query += 'modifydate=\'' + mysqlsinglequote(getdatetimestring(clipinfo.modifydate)) + '\', ';
                                                        sql_query += 'playtime=' + clipinfo.playtime + ', ';
                                                        sql_query += 'starttime=' + clipinfo.starttime + ', ';
                                                        sql_query += 'endtime=' + clipinfo.endtime + ', ';
                                                        sql_query += 'targetage=' + clipinfo.targetage + ', ';
                                                        sql_query += 'acquire=\'' + mysqlsinglequote(clipinfo.acquire) + '\', ';
                                                        sql_query += 'priority=\'' + mysqlsinglequote(clipinfo.priority) + '\' ';
                                                        sql_query += "WHERE clipid='" + mysqlsinglequote(clipinfo.clipid) + "' AND originid='" + mysqlsinglequote(clipinfo.originid) + "';";
                                                        logger.debug('[CJ] ' + sql_query);
                                                        db_connection.query(sql_query, function(err, result) {
                                                            if(err) {
                                                                db_connection.release();
                                                                logger.error("[CJ] DB Insert Query Fail : " + err + " - SMS (ANALYTIC)");
                                                                smscall('[acquire] ' + clipinfo.corporatorcode + ' clipid ' + clipinfo.clipid + ' DB Error Insert or Update T_CLIP_INFO', {group: sms_admin_group }, null);
                                                                var errorinfo = {
                                                                    httpclip: clipinfo,
                                                                    dbclip: null,
                                                                    comment: 'Acquire Error',
                                                                    group: sms_admin_group
                                                                };
                                                                each_waterfall_callback(new Error("DB Insert Query Fail - SMS (ANALYTIC)"), errorinfo);  // 20150330
                                                            } else {
                                                                // 성공 - 다음으로 진행
                                                                logger.debug("[CJ] T_CLIP_INFO Record Insert / Update Success");
                                                                each_waterfall_callback(null, db_connection, cpinfo);
                                                            }
                                                        });
                                                    } else {
                                                        logger.debug("[CJ] No T_CLIP_INFO Record Insert Skipping");
                                                        each_waterfall_callback(null, db_connection, cpinfo);
                                                    }
                                                }
                                            },
                                            function(db_connection, cpinfo, each_waterfall_callback) {
                                                logger.debug("[CJ] ###0 Check Version Info = " + version);
                                                // 입수 필요여부를 확인한다
                                                // CP_INFO에 need_acquire === 0 이면 입수를 하지 않게 한다
                                                if(cpinfo[0].need_acquire === acquire_code) {
                                                    if(clipinfo.acquire === 'N' || clipinfo.acquire === 'n' || clipinfo.acquire === '') {
                                                        // 입수해야함
                                                        // Job 확인작업
                                                        // ClipInfo에서 생성한 downloadurl 과 version 정보를 가지고 job에 해당값을 가지는 레코드가 있는지 확인한다
                                                        var target_path_temp = '/' + clipinfo.corporatorcode + '/' + clipinfo.originurl;
                                                        if(main_cp_info.code !== undefined && main_cp_info.code !== null)
                                                        {
                                                            target_path_temp = '/' + main_cp_info.code + '/' + clipinfo.originurl;
                                                        }
                                                        var target_path = target_path_temp.substring(0, target_path_temp.lastIndexOf('/')+1);
/*
                                                        var sql_query = "SELECT * FROM T_JOB WHERE downloadurl='" + downloadurl + "' and version_id=" + version + " and target_path='" + target_path + "' and related_job_id is NULL and spid='"+cpinfo[0].spid+"' and cpid='"+cpinfo[0].cpid+"' limit 1;";
/*/
                                                        //var sql_query = "SELECT * FROM T_JOB WHERE downloadurl='" + downloadurl + "' and version_id=" + version + " and target_path='" + target_path + "' and status < '12' and related_job_id is NULL and spid='"+cpinfo[0].spid+"' and cpid='"+cpinfo[0].cpid+"' limit 1;";

                                                        var download_path;
                                                        try
                                                        {
                                                            download_path = url.parse(downloadurl).pathname;
                                                        }catch(e)
                                                        {
                                                            logger.debug("[CJ] Warning downloadurl = " + downloadurl + ", "+e.message);
                                                            download_path = downloadurl;
                                                        }
                                                        try
                                                        {
                                                            download_path = path.normalize(download_path);
                                                        }catch(e)
                                                        {
                                                            logger.debug("[CJ] Warning normalize error download_path = " + download_path );
                                                        }
                                                        var sql_query = "SELECT * FROM T_JOB WHERE downloadurl like '%" + download_path + "' and version_id=" + version + " and target_path='" + target_path + "' and ( status != '12' or report_status != '2' ) and related_job_id is NULL and spid='"+cpinfo[0].spid+"' and cpid='"+cpinfo[0].cpid+"' limit 1;";
//*/
                                                        logger.debug('[CJ] ' + sql_query);
                                                        db_connection.query(sql_query, function(err, result) {
                                                            if(err) {
                                                                db_connection.release();
                                                                logger.error("[CJ] DB Select Query Fail - SMS (ANALYTIC)");
                                                                smscall('[acquire] ' + clipinfo.corporatorcode + ' clipid ' + clipinfo.clipid + ' DB Error Select T_JOB', {group: sms_admin_group }, null);
                                                                var errorinfo = {
                                                                    httpclip: clipinfo,
                                                                    dbclip: null,
                                                                    comment: 'Acquire error (select from T_JOB)',
                                                                    group: sms_admin_group
                                                                };
                                                                each_waterfall_callback(new Error('DB Select Query Fail - SMS (ANALYTIC)'), errorinfo);  //20150330
                                                            } else {
                                                                // DB Query 성공
//                                                                var target_path_temp = '/' + clipinfo.corporatorcode + '/' + clipinfo.originurl;
//                                                                var target_path = target_path_temp.substring(0, target_path_temp.lastIndexOf('/')+1);
                                                                var job_insert_query = '';
                                                                // 추가기능
                                                                // manager_config.old_data_force_batch_mode === 1 인 경우 regdate가 현재일 기준 30일이 넘는경우 priority='B'로 한다
                                                                //
                                                                var default_priority = clipinfo.priority;
                                                                if(manager_config.old_data_force_batch_mode === 1) {
                                                                    // 시간 확인
                                                                    if(clipinfo.regdate !== undefined && clipinfo.regdate !== null && clipinfo.regdate !== '') {
                                                                        var clipregtime = new Date(getdatetimestring(clipinfo.regdate));
                                                                        var nowtime = new Date();
                                                                        var diffday = parseInt((nowtime - clipregtime) / (1000*3600*24));
                                                                        if(diffday >= manager_config.old_data_force_batch_mode_limit_day) {
                                                                            // 기준이상을 넘는 경우 강재로 Batch 모드로 설정한다
                                                                            // 'N' 일때만 'B' 로 바꾼다
                                                                            if(default_priority === 'N' || default_priority === 'n') {
                                                                                logger.debug('[CJ] old file force batch mode setting.... ' + diffday + ' days');
                                                                                default_priority = 'B';
                                                                            }
                                                                        } else {
                                                                            logger.debug('[CJ] normal mode....priority not changed = ' + default_priority);
                                                                        }
                                                                    }
                                                                }

                                                                ////////////
                                                                if((main_cp_info.disable_version !== undefined && main_cp_info.disable_version === 'Y') || result.length <= 0) {
                                                                    // 없는 경우는 신규로 JOB을 생성한다
                                                                    logger.debug("[CJ] New Job Create");
                                                                    // Query
                                                                    job_insert_query = 'INSERT INTO T_JOB (clipid, spid, cpid, rules, status, report_status, cliptype, downloadurl, target_path, version_id, itemtypeid, playtime, priority, need_report, need_copy_original, num_retry) VALUES (';
                                                                    job_insert_query += '\'' + mysqlsinglequote(clipinfo.clipid) + '\', ';
                                                                    job_insert_query += '\'' + mysqlsinglequote(cpinfo[0].spid) + '\', ';
                                                                    job_insert_query += '\'' + mysqlsinglequote(cpinfo[0].cpid) + '\', ';
                                                                    job_insert_query += '\'' + mysqlsinglequote(cpinfo[0].rules) + '\', ';
                                                                    job_insert_query += '0, 0, ';
                                                                    job_insert_query += '\'' + mysqlsinglequote(clipinfo.cliptype) + '\', ';
                                                                    job_insert_query += '\'' + mysqlsinglequote(downloadurl) + '\', ';
                                                                    job_insert_query += '\'' + mysqlsinglequote(target_path) + '\', ';
                                                                    job_insert_query += version + ', ';
                                                                    job_insert_query += "'" + mysqlsinglequote(clipinfo.itemtypeid) + "', ";
                                                                    job_insert_query += clipinfo.playtime + ', ';
                                                                    job_insert_query += '\'' + mysqlsinglequote(default_priority) + '\', ';
                                                                    // 수정됨
                                                                    job_insert_query += cpinfo[0].need_report + ', ';
                                                                    job_insert_query += manager_config.need_copy_original + ', 0);';
                                                                    logger.debug('[CJ] ' + job_insert_query);
                                                                } else {
                                                                    // 있는 경우 Job Status를 확인한다
                                                                    var status = result[0].status;
                                                                    var related_job_id = result[0].job_id;
                                                                    if(status !== 70 && ((status % 10) !== 9)) {
                                                                        // 기존 JOB과 연결된 신규 JOB 정보를 입력한다
                                                                        logger.debug("[CJ] Exist Related Job Create");
                                                                        // Query
                                                                        job_insert_query = 'INSERT INTO T_JOB (clipid, spid, cpid, rules, status, report_status, cliptype, downloadurl, target_path, version_id, itemtypeid, playtime, priority, need_report, need_copy_original, related_job_id, num_retry) VALUES (';
                                                                        job_insert_query += '\'' + mysqlsinglequote(clipinfo.clipid) + '\', ';
                                                                        job_insert_query += '\'' + mysqlsinglequote(cpinfo[0].spid) + '\', ';
                                                                        job_insert_query += '\'' + mysqlsinglequote(cpinfo[0].cpid) + '\', ';
                                                                        job_insert_query += '\'' + mysqlsinglequote(cpinfo[0].rules) + '\', ';
                                                                        job_insert_query += '0, 0, ';
                                                                        job_insert_query += '\'' + mysqlsinglequote(clipinfo.cliptype) + '\', ';
                                                                        job_insert_query += '\'' + mysqlsinglequote(downloadurl) + '\', ';
                                                                        job_insert_query += '\'' + mysqlsinglequote(target_path) + '\', ';
                                                                        job_insert_query += version + ', ';
                                                                        job_insert_query += "'" + mysqlsinglequote(clipinfo.itemtypeid) + "', ";
                                                                        job_insert_query += clipinfo.playtime + ', ';
                                                                        job_insert_query += '\'' + mysqlsinglequote(default_priority) + '\', ';
                                                                        // 수정됨
                                                                        job_insert_query += cpinfo[0].need_report + ', ';
                                                                        job_insert_query += manager_config.need_copy_original + ', ';
                                                                        job_insert_query += related_job_id + ', 0);';
                                                                        logger.debug('[CJ] ' + job_insert_query);

                                                                    } else {
                                                                        // 기존 JOB과 연결된 비보고 JOB 정보를 입력한다
                                                                        logger.debug("[CJ] Exist Related Job Create but not reporting");
                                                                        // Query
                                                                        job_insert_query = 'INSERT INTO T_JOB (clipid, spid, cpid, rules, status, report_status, cliptype, downloadurl, target_path, version_id, itemtypeid, playtime, priority, need_report, need_copy_original, related_job_id, num_retry) VALUES (';
                                                                        job_insert_query += '\'' + mysqlsinglequote(clipinfo.clipid) + '\', ';
                                                                        job_insert_query += '\'' + mysqlsinglequote(cpinfo[0].spid) + '\', ';
                                                                        job_insert_query += '\'' + mysqlsinglequote(cpinfo[0].cpid) + '\', ';
                                                                        job_insert_query += '\'' + mysqlsinglequote(cpinfo[0].rules) + '\', ';
                                                                        job_insert_query += '0, 0, ';
                                                                        job_insert_query += '\'' + mysqlsinglequote(clipinfo.cliptype) + '\', ';
                                                                        job_insert_query += '\'' + mysqlsinglequote(downloadurl) + '\', ';
                                                                        job_insert_query += '\'' + mysqlsinglequote(target_path) + '\', ';
                                                                        job_insert_query += version + ', ';
                                                                        job_insert_query += "'" + mysqlsinglequote(clipinfo.itemtypeid) + "', ";
                                                                        job_insert_query += clipinfo.playtime + ', ';
                                                                        //job_insert_query += '\'' + mysqlsinglequote(default_priority) + '\', 0, ';
                                                                        job_insert_query += '\'' + mysqlsinglequote(default_priority) + '\', ';
                                                                        // 수정됨
                                                                        job_insert_query += cpinfo[0].need_report + ', ';
                                                                        job_insert_query += manager_config.need_copy_original + ', ';
                                                                        job_insert_query += related_job_id + ', 0);';
                                                                        logger.debug('[CJ] ' + job_insert_query);
                                                                    }
                                                                }
                                                                // JOB DB Insert
                                                                db_connection.query(job_insert_query, function(err, result) {
                                                                    // DB 연결 해제
                                                                    if(err) {
                                                                        //
                                                                        db_connection.release();
                                                                        logger.error("[CJ] T_JOB DB Insert Query Fail : " + err + " - SMS (ANALYTIC)");
                                                                        smscall('[acquire] ' + clipinfo.corporatorcode + ' clipid ' + clipinfo.clipid + ' DB Error Insert T_JOB', {group: sms_admin_group }, null);
                                                                        var errorinfo = {
                                                                            httpclip: clipinfo,
                                                                            dbclip: null,
                                                                            comment: 'Acquire error (insert T_JOB)',
                                                                            group: sms_admin_group

                                                                        };
                                                                        each_waterfall_callback(new Error('DB Insert Query Fail - SMS (ANALYTIC)'), errorinfo);  // 20150330
                                                                    } else {
                                                                        // Success
                                                                        db_connection.release();
                                                                        logger.debug("[CJ] T_JOB Record Insert Success");
                                                                        each_waterfall_callback(null, 1);
                                                                    }
                                                                });
                                                            }
                                                        });
                                                    } else {
                                                        // 입수를 안함
                                                        logger.debug("[CJ] Acquire not 'N' No Gathering");
                                                        // Skip
                                                        // db connection 정리
                                                        db_connection.release();
                                                        each_waterfall_callback(null, 2);
                                                    }
                                                } else {
                                                    logger.debug("[CJ] CP=" + cpinfo[0].cpid + " not allowed Gathering");
                                                    db_connection.release();
                                                    each_waterfall_callback(null, 3);
                                                }
                                            },
                                            function(gather_status, each_waterfall_callback) {
                                                // 진행상황 보고
                                                if(gather_status === 1 || gather_status === 3) {
                                                    var formdata = null;
                                                    if(gather_status === 1) {
                                                        formdata = {
                                                            clipid: clipinfo.originid,
                                                            acquire: "P",
                                                            comment: "Processing",
                                                            mediaurl: clipinfo.mediaurl,
                                                            playtime: clipinfo.playtime,
                                                            itemtypeid: clipinfo.itemtypeid
                                                        };
                                                    } else {
                                                        formdata = {
                                                            clipid: clipinfo.originid,
                                                            acquire: "F",
                                                            comment: "Acquire error",
                                                            mediaurl: '',
                                                            playtime: '',
                                                            itemtypeid: ''
                                                        };
                                                    }
                                                    logger.debug("[CJ] Report Form = " + JSON.stringify(formdata));
                                                    logger.debug("[CJ] Progress report Start : " + main_cp_info.report_url);

                                                    // reporter api 호출
                                                    report_result(main_cp_info.report_url, formdata, function(request_err, response, body) {
                                                        if(request_err || response.statusCode !== 200) {
                                                            logger.error("[CJ] Error : " + request_err + " - SMS (ANALYTIC)");
                                                            if(!clipacquirereport_api_error[main_cp_info.spid]) {
                                                                // error발생상황이 아니었던 경우 SMS 발송을 하고 상태를 error 상태로 바꾼다
                                                                clipacquirereport_api_error[main_cp_info.spid] = true;
                                                                smscall('[api] clipacquirereport http error', {group: sms_group}, null);
                                                            }

                                                            //smscall('[api] ' + clipinfo.corporatorcode + ' ' + clipinfo.clipid + ' clipacquirereport http error', {group: sms_group }, null);
                                                            var errorinfo = {
                                                                httpclip: clipinfo,
                                                                dbclip: null,
                                                                comment: 'CMS Server Error',
                                                                group: sms_group
                                                            };
                                                            each_waterfall_callback(new Error('ClipInfo Report HTTP Error - SMS (ANALYTIC)'), errorinfo);    // 20150330
                                                        } else {
                                                            // HTTP POST Receive 성공
                                                            logger.debug("[CJ] Progress report by POST Success : " + body);
                                                            // 성공한경우 이전 error 상태를 확인해서 error를 복구했다고 SMS 전송
                                                            if(clipacquirereport_api_error[main_cp_info.spid]) {
                                                                // error발생상황이 아니었던 경우 SMS 발송을 하고 상태를 error 상태로 바꾼다
                                                                clipacquirereport_api_error[main_cp_info.spid] = false;
                                                                smscall('[api] clipacquirereport http OK', {group: sms_group}, null);
                                                            }
                                                            // 한번더 확인한다 2015-07-08 #2
                                                            var request_form = {
                                                                cpid: main_cp_info.cpid,
                                                                clipid: formdata.clipid,
                                                                type: 'recent',
                                                                acquire: ''
                                                            };

                                                            // request api 호출
                                                            function cb_gethttpgetretry(err, result)
                                                            {
                                                                if(err)
                                                                {
                                                                    logger.error("[CJ] Verify Error : " + err + " SMS (ANALYTIC)");
//                                                                  smscall('[api] ' + main_cp_info.name + ' clipacquirelist http error', {group: sms_admin_group }, null);
                                                                }else
                                                                {
                                                                    logger.debug("[CJ] Verify Success : " + result.body);
                                                                }
                                                                eachseries_callback(null, 'SUCCESS');
                                                            }
                                                            gethttpgetretry(main_cp_info.request_url, request_form, 120000, 1, cb_gethttpgetretry);

                                                            //each_waterfall_callback(null, 'SUCCESS');
                                                        }
                                                    });
                                                } else {
                                                    // Skipping
                                                    each_waterfall_callback(null, 'SUCCESS');
                                                }
                                            }
                                        ],
                                        function(each_waterfall_err, each_waterfall_result) {
                                            if(each_waterfall_err) {
                                                //eachseries_callback(each_waterfall_err, null);
                                                // 하나가 오류가 나도 다음것으로 넘어간다
                                                logger.debug("[CJ] EachSeries_Waterfall Error Skip : " + each_waterfall_err.toString());
                                                // Error 보고를 한다
                                                var targeterrorinfo = each_waterfall_result;
                                                if(targeterrorinfo !== null && targeterrorinfo !== undefined && targeterrorinfo !== '') {
                                                    if(targeterrorinfo.httpclip !== null && targeterrorinfo.httpclip !== undefined && targeterrorinfo.httpclip !== '') {
                                                        var targetclipinfo = targeterrorinfo.httpclip;
                                                        var targetdbclipinfo = targeterrorinfo.dbclip;
                                                        var targetcomment = targeterrorinfo.comment;
                                                        var targetgroup = targeterrorinfo.group;
                                                        if(targetclipinfo.clipid !== undefined && targetclipinfo.clipid !== null && targetclipinfo.clipid !== '') {
                                                            //clipid 있는 경우 에러를 보고한다
                                                            var report_form = {
                                                                clipid: targetclipinfo.clipid,
                                                                acquire: 'F',
                                                                //comment: each_waterfall_err.toString(),
                                                                comment: targetcomment,
                                                                mediaurl: '',
                                                                playtime: '',
                                                                itemtypeid: ''
                                                            };
                                                            if(targetclipinfo.originid !== undefined && targetclipinfo.originid !== null && targetclipinfo.originid !== '') {
                                                                report_form.clipid = targetclipinfo.originid;
                                                            }

                                                            if(targetclipinfo.mediaurl !== undefined && targetclipinfo.mediaurl !== null) {
                                                                report_form.mediaurl = targetclipinfo.mediaurl;
                                                            }
                                                            if(targetclipinfo.playtime !== undefined && targetclipinfo.playtime !== null) {
                                                                report_form.playtime = targetclipinfo.playtime;
                                                            }
                                                            if(targetclipinfo.itemtypeid !== undefined && targetclipinfo.itemtypeid !== null) {
                                                                report_form.itemtypeid = targetclipinfo.itemtypeid;
                                                            }

                                                            if(each_waterfall_err.toString().indexOf('HTTP HEAD') !== -1) {
                                                                // HTTP HEAD 관련 오류발생 - 확인 안되는 경우 현재의 acquire 상태를 그대로 보고한다 (현재 DB)
                                                                logger.debug("[CJ] Target ClipInfo = " + JSON.stringify(targetclipinfo));
                                                                if(targetdbclipinfo !== undefined && targetdbclipinfo !== null && targetdbclipinfo !== '') {
                                                                    // 있는 경우에만 한다
                                                                    if(targetdbclipinfo.acquire !== undefined && targetdbclipinfo.acquire !== null) {
                                                                        report_form.acquire = targetdbclipinfo.acquire;
                                                                    }
                                                                    if(targetdbclipinfo.mediaurl !== undefined && targetdbclipinfo.mediaurl !== null) {
                                                                        report_form.mediaurl = targetdbclipinfo.mediaurl;
                                                                    }
                                                                    if(targetdbclipinfo.playtime !== undefined && targetdbclipinfo.playtime !== null) {
                                                                        report_form.playtime = targetdbclipinfo.playtime;
                                                                    }
                                                                    if(targetdbclipinfo.itemtypeid !== undefined && targetdbclipinfo.itemtypeid !== null) {
                                                                        report_form.itemtypeid = targetdbclipinfo.itemtypeid;
                                                                    }
                                                                    report_form.comment = 'originurl cannot check';
                                                                }
                                                            }

                                                            if(each_waterfall_err.toString().indexOf('New Clip Duplicated') !== -1) {
                                                                // 신규로 중복되는 경우로써 이경우는 그대로 현재의 클립정보를 보고한다
                                                                logger.debug("[CJ] Target ClipInfo = " + JSON.stringify(targetclipinfo));
                                                                if(targetdbclipinfo !== undefined && targetdbclipinfo !== null && targetdbclipinfo !== '') {
                                                                    // 있는 경우에만 한다
                                                                    if(targetdbclipinfo.acquire !== null && targetdbclipinfo.acquire !== undefined) {
                                                                        if(targetdbclipinfo.acquire !== 'N') {
                                                                            report_form.acquire = targetdbclipinfo.acquire;
                                                                        } else {
                                                                            // N 인경우는 진행중
                                                                            report_form.acquire = 'P';
                                                                        }

                                                                    }
                                                                    if(targetdbclipinfo.mediaurl !== undefined && targetdbclipinfo.mediaurl !== null) {
                                                                        report_form.mediaurl = targetdbclipinfo.mediaurl;
                                                                    }
                                                                    if(targetdbclipinfo.playtime !== undefined && targetdbclipinfo.playtime !== null) {
                                                                        report_form.playtime = targetdbclipinfo.playtime;
                                                                    }
                                                                    if(targetdbclipinfo.itemtypeid !== undefined && targetdbclipinfo.itemtypeid !== null) {
                                                                        report_form.itemtypeid = targetdbclipinfo.itemtypeid;
                                                                    }
                                                                    //report_form.comment = 'Clip Duplicated use exist clip info';
                                                                    report_form.comment = 'request duplicated';            // 20150401
                                                                }
                                                            }

                                                            logger.error("[CJ] Report Form = " + JSON.stringify(report_form));
                                                            logger.debug("[CJ] Progress report Start : " + main_cp_info.report_url);

                                                            // reporter api 호출
                                                            report_result(main_cp_info.report_url, report_form, function(request_err, response, body) {
                                                                if(request_err || response.statusCode !== 200) {
                                                                    logger.error("[CJ] Progress Error report Fail : " + request_err + " - SMS (ANALYTIC)");
                                                                    if(!clipacquirereport_api_error[main_cp_info.spid]) {
                                                                        // error발생상황이 아니었던 경우 SMS 발송을 하고 상태를 error 상태로 바꾼다
                                                                        clipacquirereport_api_error[main_cp_info.spid] = true;
                                                                        smscall('[api] clipacquirereport http error', {group: sms_group }, null);
                                                                    }

                                                                    //smscall('[api] ' + targetclipinfo.corporatorcode + ' ' + targetclipinfo.clipid + ' clipacquirereport http error', {group: sms_group }, null);
                                                                    eachseries_callback(null);
                                                                } else {
                                                                    // HTTP POST Receive 성공 다음턴으로 넘어간다
                                                                    logger.debug("[CJ] Progress Error report by POST Success : " + body);
                                                                    // 성공한경우 이전 error 상태를 확인해서 error를 복구했다고 SMS 전송
                                                                    if(clipacquirereport_api_error[main_cp_info.spid]) {
                                                                        // error발생상황이 아니었던 경우 SMS 발송을 하고 상태를 error 상태로 바꾼다
                                                                        clipacquirereport_api_error[main_cp_info.spid] = false;
                                                                        smscall('[api] clipacquirereport http OK', {group: sms_group }, null);
                                                                    }
                                                                    // 한번더 전송된 상황을 확인한다 2015-07-08 #2
                                                                    var request_form = {
                                                                        cpid: main_cp_info.cpid,
                                                                        clipid: report_form.clipid,
                                                                        type: 'recent',
                                                                        acquire: ''
                                                                    };

                                                                    // request api 호출
                                                                    function cb_gethttpgetretry(err, result)
                                                                    {
                                                                        if(err)
                                                                        {
                                                                            logger.error("[CJ] Verify Error : " + err + " SMS (ANALYTIC)");
//                                                                            smscall('[api] ' + main_cp_info.name + ' clipacquirelist http error', {group: sms_admin_group }, null);
                                                                        }else
                                                                        {
                                                                            logger.debug("[CJ] Verify Success : " + result.body);
                                                                        }
                                                                    }
                                                                    gethttpgetretry(main_cp_info.request_url, request_form, 120000, 1, cb_gethttpgetretry);


                                                                    // DB 업데이트를 한다
                                                                    if(each_waterfall_err.toString().indexOf('New Clip Duplicated') === -1 && each_waterfall_err.toString().indexOf('HTTP HEAD') === -1) {
                                                                        // DB 업데이트가 필요한경우
                                                                        // db connection 을 만들고 T_CLIP_INFO를 업데이트한다
                                                                        logger.debug("[CJ] Fail Update to T_CLIP_INFO");
                                                                        getDBConnection('CJ', function(err, dbConnection) {
                                                                            if(err) {
                                                                                // 다음턴으로 넘어간다
                                                                                logger.error("[CJ] All DB Connection Fail - SMS (ANALYTIC)");
                                                                                smscall('[acquire] ' + targetclipinfo.corporatorcode + ' clipid ' + targetclipinfo.clipid + ' DB Connection Fail', {group: sms_admin_group }, null);
                                                                                eachseries_callback(null);
                                                                            } else {
                                                                                // 업데이트를 수행한다 clipid 에 대한 acquire 를 F로 만든다
                                                                                var sql_query = "UPDATE T_CLIP_INFO set acquire='F' WHERE clipid='" + targetclipinfo.clipid + "' AND spid='"+main_cp_info.spid+"';";
                                                                                logger.debug("[CJ] " + sql_query);
                                                                                dbConnection.query(sql_query, function(err, result) {
                                                                                    if(err) {
                                                                                        // Query Error Skip
                                                                                        dbConnection.release();
                                                                                        logger.error("[CJ] DB Select Query Error - SMS (ANALYTIC) : " + err);
                                                                                        smscall('[acquire] ' + targetclipinfo.corporatorcode + ' clipid ' + targetclipinfo.clipid + ' DB Update Error T_CLIP_INFO', {group: sms_admin_group }, null);
                                                                                        eachseries_callback(null);
                                                                                    } else {
                                                                                        // 업데이트 성공시 다음턴으로 간다
                                                                                        dbConnection.release();
                                                                                        logger.error("[CJ] DB Fail Report Update Query Success");
                                                                                        eachseries_callback(null);
                                                                                    }
                                                                                });
                                                                            }
                                                                        });
                                                                    } else {
                                                                        // 다음턴으로 넘어간다
                                                                        //smscall("[acquire] " + targetcomment, {group: tergetgroup}, null);
                                                                        eachseries_callback(null);
                                                                    }
                                                                }
                                                            });
                                                        } else {
                                                            // clipid 없으면 보고 안하고 스킵한다
                                                            eachseries_callback(null);
                                                        }
                                                    } else {
                                                        // 없으면 보고 안하고 스킵한다
                                                        eachseries_callback(null);
                                                    }
                                                } else {
                                                    // 없으면 보고 안하고 스킵한다
                                                    eachseries_callback(null);
                                                }
                                            } else {
                                                logger.debug("[CJ] EachSeries_Waterfall Success");
                                                eachseries_callback(null);
                                            }
                                        });
                                   },
                                   function(each_series_err) {
                                       if(each_series_err) {
                                           logger.debug("[CJ] EachSeries Error : " + each_series_err);
                                           waterfall_callback(each_series_err, null);
                                       } else {
                                           logger.debug("[CJ] EachSeries Success");
                                           waterfall_callback(null, 'SUCCESS');
                                       }
                                   });
                               }
                           }
                       }
                    ],
                    function(waterfall_err, waterfall_result) {
                        if(waterfall_err) {
                            if(waterfall_result === 1) {
                                logger.debug("[CJ] No Clip Data - Skip to Next Turn");
                                cp_success_count++;
                            } else {
                                logger.error("[CJ] Waterfall Error Out : " + waterfall_err);
                            }
                        } else {
                            // Success
                            cp_success_count++;
                            logger.debug("[CJ] Waterfall Success : " + waterfall_result);
                        }
                        //logger.debug("[CJ] Timer Setup : " + manager_config.clip_data_polling_period + " sec");
                        //timerObj_clipinforeceiver_jobcreator = setTimeout(clipinforeceiver_jobcreator, manager_config.clip_data_polling_period * 1000);
                        logger.debug("[CJ] ************************** CP : " + main_cp_info.name + " END **********************************");
                        each_callback(null);
                    });

                }, function(err) {
                    if(err) {
                        main_waterfall_callback(err, null);
                    } else {
                        logger.debug("[CJ] ************************** ALL CP DONE **********************************");
                        logger.debug("[CJ] SUCCESS COUNT = " + cp_success_count);
                        if((enable_cp_count > 0) && (cp_success_count === enable_cp_count)) {
                            // 전체가 성공이므로 메시지맵을 클리어한다
                            logger.debug("[CJ] Clearing Msg Map");
                            var now = new Date();
/*
                            sms_filtering_http['[api] TAGSTORY clipacquirelist http error'] = { ctime: now, count: 0 };
                            sms_filtering_json['[api] TAGSTORY clipacquirelist json error'] = { ctime: now, count: 0 };
*/
                            sms_filtering_http = {};
                            sms_filtering_json = {};

                            if(clipacquirelist_api_error) {
                                // 만일 이전에 에러 상황이었으면 정상으로 돌리고 Recovery SMS를 날린다
                                logger.debug("[CJ] Recovery Status : Error -> Normal");
                                clipacquirelist_api_error = false;
                                smscall('[api] clipacquirelist OK', {group: config.default_alert_group }, null);
                            }
                        }
                        main_waterfall_callback(null, 'EACH SUCCESS');
                    }
                });
            } else {
                // 결과가 없는 경우는 아무것도 하지 않는다
                main_waterfall_callback(new Error('No working target CP'), null);
                return;
            }
        }
    ], function(main_waterfall_err, main_waterfall_result){
        if(main_waterfall_err) {
            logger.debug('[CJ] Main Waterfall ERROR=' + main_waterfall_err.toString());
        } else {
            logger.debug("[CJ] All CP Job Created");
        }
        // Timer 복구
        logger.debug("[CJ] Timer Setup : " + manager_config.clip_data_polling_period + " sec");
        timerObj_clipinforeceiver_jobcreator = setTimeout(clipinforeceiver_jobcreator, manager_config.clip_data_polling_period * 1000);
        if(timerObj_clipinforeceiver_jobcreator === null || timerObj_clipinforeceiver_jobcreator === undefined || timerObj_clipinforeceiver_jobcreator === "") {
            // 혹시 NULL 나오면 즉시 SMS 알린다
            logger.error("[CJ] Timer Setup Fail");
            smscall('[acquire] JobCreator Timer Fail', {group: config.default_alert_group }, null);
        }
    });
}

function clipinforeporter() {
    clearTimeout(timerObj_clipinforeporter);
    timerObj_clipinforeporter = null;
    logger.debug("[CR] Start");
    async.waterfall([
        function(waterfall_callback) {
           // DB Connection 가져오기
           logger.debug("[CR] Get DB Connection");
           getDBConnection('CR', function(err, dbConnection) {
               if(err) {
                   logger.error("[CR] All DB Connection Fail - SMS (ANALYTIC)");
                   smscall('[acquire] DB Connection Fail', {group: config.default_alert_group }, null);
                   waterfall_callback(err, null);
                   return;
               } else {
                   logger.debug("[CR] Get DB Connection Success");
                   waterfall_callback(null, dbConnection);
                   return;
               }
           });
       },
       function(db_connection, waterfall_callback) {
           // DB에서 보고 대상 Job을 확인한다
           //var sql_query = 'SELECT * FROM T_JOB WHERE status in (70, 9, 19, 29, 39) and report_status in (0, 5, 9) and need_report=1;';
           var sql_query = 'SELECT * FROM T_JOB J, T_CP_INFO C WHERE J.status in (70, 9, 19, 29, 39) and J.report_status in (0, 5, 9) and J.cpid = C.cpid and J.spid = C.spid and C.need_acquire='+acquire_code+';';
           logger.debug("[CR] " + sql_query);
           db_connection.query(sql_query, function(err, result) {
               //db_connection.release();
               if(err) {
                   // DB Error
                   db_connection.release();
                   logger.error("[CR] DB Select Query Error - SMS (ANALYTIC) : " + err);
                   smscall('[acquire] DB Select Fail T_JOB', {group: config.default_alert_group }, null);
                   waterfall_callback(new Error('[CR] DB Select Query Error - SMS (ANALYTIC) : ' + err), null);
                   return;
               } else {
                   db_connection.release();
                   if(result.length <= 0) {
                       // 결과가 없는 경우 아무것도 하지 않는다
                       // DB 연결 종료 후 Result로 Out
                       logger.debug("[CR] No Report Job");
                       waterfall_callback(null, 'No Report Job');
                       return;
                   } else {
                       // 결과가 있는 경우 레코드 수만큼 반복처리한다
                       logger.debug("[CR] Record Count = " + result.length);
                       var job_count = 1;
                       async.eachSeries(result, function(job, each_series_callback) {
                            // 처리루틴
                            var job_updated_media_url = '';
                            var sms_report = [];
                            var sms_group = [];

                            sms_report = JSON.parse(JSON.stringify(sms_admin_group));
                            sms_group = JSON.parse(JSON.stringify(sms_admin_group));
                            if(job.alert_group)
                            {
                                sms_report = sms_report.concat(job.alert_group.split(','));
                            }
                            if(job.alert_admin_group)
                            {
                                sms_report = sms_report.concat(job.alert_group.split(','));
                                sms_group = sms_group.concat(job.alert_admin_group.split(','));
                            }

                            sms_group=sms_group.reduce(function(a,b){if(a.indexOf(b)<0)a.push(b);return a;},[]);
                            sms_admin_group=sms_admin_group.reduce(function(a,b){if(a.indexOf(b)<0)a.push(b);return a;},[]);
                            sms_report=sms_report.reduce(function(a,b){if(a.indexOf(b)<0)a.push(b);return a;},[]);

                           async.waterfall([
                               function(each_waterfall_callback) {
                                   // DB Connection 을 연다
                                   getDBConnection('EACH - CR', function(err, each_waterfall_dbConnection) {
                                       if(err) {
                                           logger.error("[CR] All DB Connection Fail - SMS (ANALYTIC)");
                                           smscall('[acquire] DB Connection Fail', {group: sms_admin_group }, null);
                                           each_waterfall_callback(err, null);
                                           return;
                                       } else {
                                           logger.debug("[CR] Get DB Connection Success");
                                           each_waterfall_callback(null, each_waterfall_dbConnection);
                                           return;
                                       }
                                   });
                               },
                               function(each_db_connection, each_waterfall_callback) {
                                   // clipinfo를 DB에서 읽어온다
//                                   var sql_query = 'SELECT * FROM T_CLIP_INFO WHERE clipid=\'' + job.clipid + '\' limit 1;';
                                   //var sql_query = "SELECT * FROM T_CLIP_INFO as A, T_CP_INFO as B           WHERE A.clipid='" + job.clipid + "' AND A.cpid=B.cpid AND A.cpid='"+job.cpid+"' AND A.spid=B.spid AND A.spid='"+job.spid+"' limit 1;";
                                   var sql_query;
                                   if(job.status === 70)
                                   {
                                       sql_query = "SELECT * from T_CLIP_INFO as A, T_CP_INFO as B, T_RULE R ";
                                       sql_query += " WHERE A.clipid='" + job.clipid + "' ";
                                       sql_query += " AND A.cpid=B.cpid AND A.cpid='"+job.cpid+"' ";
                                       sql_query += " AND A.spid=B.spid AND A.spid='"+job.spid+"' ";
                                       sql_query += " AND R.ruleid in ("+job.rules+") and R.itemtypeid = '"+job.itemtypeid+"' limit 1;"
                                   }else
                                   {
                                       sql_query = "SELECT * from T_CLIP_INFO as A, T_CP_INFO as B ";
                                       sql_query += " WHERE A.clipid='" + job.clipid + "' ";
                                       sql_query += " AND A.cpid=B.cpid AND A.cpid='"+job.cpid+"' ";
                                       sql_query += " AND A.spid=B.spid AND A.spid='"+job.spid+"' ";
                                       sql_query += " limit 1;"
                                   }
                                   logger.debug("[CR] DB Select Query :" + sql_query);
                                   each_db_connection.query(sql_query, function(err, t_clip_info_result) {
                                       if(err) {
                                           // DB Query Error
                                           each_db_connection.release();
                                           logger.error("[CR] DB Select Query Error - SMS (ANALYTIC) : " + err);
                                           smscall('[acquire] DB Select Fail T_CLIP_INFO', {group: sms_admin_group }, null);
                                           each_waterfall_callback(new Error("[CR] DB Select Query Error - SMS (ANALYTIC) : " + err), null);
                                           return;
                                       } else {
                                           if(t_clip_info_result.length <= 0) {
                                               // 없는 경우는 오류
                                               each_db_connection.release();
                                               logger.error("[CR] No Matched Clipinfo Error - SMS (ANALYTIC) : " + job.clipid);
                                               smscall('[acquire] No Matched Clipinfo =' + job.clipid, {group: sms_admin_group }, null);
                                               each_waterfall_callback(new Error("[CR] No Matched Clipinfo Error - SMS (ANALYTIC) : " + job.clipid), null);
                                               return;
                                           } else {
                                               // 있는 경우 다음함수에 clipinfo를 넘겨준다
                                               each_waterfall_callback(null, each_db_connection, t_clip_info_result[0]);
                                               return;
                                           }
                                       }
                                   });
                               },
                               function(each_db_connection, clipinfo, each_waterfall_callback) {
                                   // MediaURL을 생성한다
                                   var update_media_url = '';
                                   if(job.status === 70) {
                                       var originurl = clipinfo.originurl;
                                       var version = job.version_id;
                                       var itemtypeid = job.itemtypeid;
                                       var dotindex = originurl.lastIndexOf('.');
                                       var filenamebody = originurl.substring(0, dotindex);
                                       var cp_code = clipinfo.corporatorcode;
                                       var extension = clipinfo.fpostfix;
                                       if(clipinfo.code !== undefined && clipinfo.code !== null)
                                       {
                                           cp_code = clipinfo.code;
                                       }
                                       if(version === 1) {
                                           update_media_url = path.normalize('/'+cp_code+''+filenamebody + extension);
                                       } else {
                                           update_media_url = path.normalize('/'+cp_code+''+filenamebody + '_v' + version + extension);
                                       }
                                   }
                                   // 다음으로 진행한다
                                   each_waterfall_callback(null, each_db_connection, clipinfo, update_media_url);
                                   return;
                               },
                               function(each_db_connection, clipinfo, update_media_url, each_waterfall_callback) {
                                   if(job.status !== 70) {
                                       each_waterfall_callback(null, each_db_connection, clipinfo, update_media_url);
                                       return;
                                   }
                                   if(!config.copy || !config.copy.src || !config.copy.dest
                                           || !fs.existsSync(config.copy.src) || !fs.existsSync(config.copy.dest) )
                                   {
                                       each_waterfall_callback(null, each_db_connection, clipinfo, update_media_url);
                                       return;
                                   }
/* TS 는 파일 하나만 생성하므로, 여러개가 대상인 경우는 고려하지 않음. */

                                   function copy_file(org_path, dest_path, cb_copy_file)
                                   {
                                       var report = false;
                                       var input = fs.createReadStream(org_path);
                                       var output = fs.createWriteStream(dest_path);
                                       input.pipe(output);
                                       input.on('end', function(){
                                           logger.debug('[CR] Copy '+org_path+' to '+dest_path);
                                           if(!report)
                                           {
                                               cb_copy_file(null);
                                               report = true;
                                           }
                                       });
                                       input.on("error", function(e){
                                           logger.debug('[CR] Copy Error from '+org_path+' to '+dest_path);
                                           if(!report)
                                           {
                                               cb_copy_file(e);
                                               report = true;
                                           }
                                       });
                                       output.on("error", function(e){
                                           logger.debug('[CR] Copy Error from '+org_path+' to '+dest_path);
                                           if(!report)
                                           {
                                               cb_copy_file(e);
                                               report = true;
                                           }
                                       });
                                   }

if (1)
{
                                   var src = config.copy.src+'/'+update_media_url;
                                   var dest = config.copy.dest+'/'+update_media_url;
                                   mkdir_for_file(dest);
                                   copy_file(src, dest, function(e)
                                           {
                                               if(e)
                                               {
                                                   job.status = 69;
                                               }
                                               each_waterfall_callback(null, each_db_connection, clipinfo, update_media_url);
                                               return;
                                           });
}else
{
console.log("TTTT "+update_media_url+", "+JSON.stringify(clipinfo));
each_waterfall_callback(null, each_db_connection, clipinfo, update_media_url);
return;
}
                               },
                               function(each_db_connection, clipinfo, update_media_url, each_waterfall_callback) {
                                   if(config.runmode === 'normal' && config.media_check_url) {
                                        if(job.status === 70) {
                                             // mediaurl 과 corporatorcode를 가지고 확인작업을 한다
                                             // HTTP를 통해서 확인한다
                                             var request_form = {
                                                 corporatorcode: clipinfo.corporatorcode,
                                                 mediaurl: update_media_url
                                             };
                                             if(clipinfo.code !== undefined && clipinfo.code !== null && clipinfo.code !== '')
                                             {
                                                 request_form.corporatorcode  = clipinfo.code;
                                             }
                                             logger.debug("[CR] URL=" + config.media_check_url + "/ Request Form : " + JSON.stringify(request_form));
                                             request.get({
                                                 url: config.media_check_url,
                                                 qs: request_form,
                                                 timeout: 120000
                                             },
                                             function(request_err, response, body) {
                                                 if(request_err || response.statusCode !== 200) {
                                                     logger.error("[CR] HTTP Error or Status not 200 - SMS (ANALYTIC)");

                                                     // 이 경우는 'F' 보고를 해야한다
                                                     each_waterfall_callback(null, each_db_connection, clipinfo, update_media_url, 3);
                                                 } else {
                                                     // HTTP Get Receive 성공
                                                     logger.debug("[CR] Success : " + body);
                                                     // usable:yes 확인
                                                     var response = null;
                                                     try {
                                                         var tab_removebody = body.replace(/\t/g, ' ');
                                                         //response = JSON.parse(body);
                                                         response = JSON.parse(tab_removebody);
                                                         if(response.usable === 'yes') {
                                                             // 성공 다음으로 진행
                                                             each_waterfall_callback(null, each_db_connection, clipinfo, update_media_url, 0);
                                                         } else {
                                                             // 'F' 보고를 하도록 한다
                                                             each_waterfall_callback(null, each_db_connection, clipinfo, update_media_url, 1);
                                                         }
                                                     } catch(err) {
                                                         // JSON 파싱오류발생
                                                         // 이 경우는 'F' 보고를 한다
                                                         each_waterfall_callback(null, each_db_connection, clipinfo, update_media_url, 2);
                                                     }
                                                 }
                                             });
                                        } else {
                                             // Skip 하고 다음으로 진행한다
                                             each_waterfall_callback(null, each_db_connection, clipinfo, update_media_url, 0);
                                        }
                                   } else {
                                       // runmode !== normal - devmode
                                       each_waterfall_callback(null, each_db_connection, clipinfo, update_media_url, 0);
                                   }
                               },
                               function(each_db_connection, clipinfo, update_media_url, media_usable, each_waterfall_callback) {
                                   // Job Status 확인 후 세팅
                                   var send_form = {};
                                   if(job.status === 70) {
                                       logger.debug('[CR] Media Usable Value = ' + media_usable);
                                       if(media_usable === 0) {
//                                           send_form.clipid = job.clipid;
                                           send_form.clipid = clipinfo.originid;
                                           send_form.acquire = 'Y';
                                           send_form.comment = 'Acquire Done';
                                           //send_form.mediaurl = job_updated_media_url;
                                           send_form.mediaurl = update_media_url;
                                           send_form.playtime = job.playtime;
                                           send_form.itemtypeid = job.itemtypeid;
                                       } else {
                                           var smsmsg = 'mediaurl error';
//                                           send_form.clipid = job.clipid;
                                           send_form.clipid = clipinfo.originid;
                                           send_form.acquire = 'F';
                                           if(media_usable === 1) {
                                               smsmsg = 'mediafile unavailiable';
                                           } else if(media_usable === 2) {
                                               smsmsg = 'mediafile checker json error';
                                           } else {
                                               smsmsg = 'mediafile checker http error';
                                           }
                                           send_form.comment = 'mediaurl error';                // 20150401
                                           //send_form.mediaurl = job_updated_media_url;
                                           send_form.mediaurl = '';
                                           send_form.playtime = job.playtime;
                                           send_form.itemtypeid = job.itemtypeid;

                                           //smscall('[acquire] ' + clipinfo.corporatorcode + ' clipid ' + clipinfo.clipid + ' mediaurl error', {group: sms_admin_group }, null);
                                           smscall('[acquire] ' + clipinfo.corporatorcode + ' clipid ' + clipinfo.clipid + ' ' + smsmsg, {group: sms_admin_group }, null);
                                       }
                                   } else {
                                       // 에러인 경우
//                                       send_form.clipid = job.clipid;
                                       send_form.clipid = clipinfo.originid;
                                       send_form.acquire = 'F';
                                       //send_form.comment = geterrormsg(job.status);
                                       //send_form.comment = job.err_message;         // Changed 20150331
                                       send_form.comment = 'Acquire error';         // Changed 20150331
                                       // 에러에 대해서는 mediaurl을 '' 으로 보낸다
                                       send_form.mediaurl = '';
                                       send_form.playtime = job.playtime;
                                       send_form.itemtypeid = job.itemtypeid;

                                       // 조건에 따른 변경
                                       var smsmsg = send_form.comment;
                                       if(job.status === 19 && (job.err_message.indexOf('Not valid url') !== -1 || job.err_message.indexOf('Not completely downloaded') !== -1)) {
                                           send_form.comment = job.err_message;
                                           smsmsg = 'file not found';
                                       }

                                       if(job.status === 19 && (job.err_message.indexOf('socket hang up') !== -1)) {
                                           send_form.comment = job.err_message;
                                           smsmsg = 'CDN Connection Error';
                                       }

                                       if(job.status === 19 && (job.err_message.indexOf('clip server does not respond') !== -1)) {
                                           send_form.comment = job.err_message;
                                           smsmsg = 'CDN Connection Error';
                                       }

                                       if(job.status === 29 && job.err_message.indexOf('Invalid') !== -1) {
                                           if(job.err_message.indexOf('Height :') !== -1) {
                                               var colonindex = job.err_message.indexOf('Height :');
                                               var closeindex = job.err_message.lastIndexOf(')');
                                               var result = job.err_message.slice(colonindex+'Height :'.length, closeindex);
                                               smsmsg = 'unsupported resolution ' + result;
                                           } else {
                                               smsmsg = 'invalid file';
                                           }
                                           send_form.comment = job.err_message;
                                       }
/* TS 파일 복사 실패 시. */
                                       if(job.status === 69)
                                       {
                                           smsmsg = 'Copy File Error';
                                       }
/* TS 파일 복사 실패 시. */

                                       //smscall('[cp] ' + clipinfo.corporatorcode + ' clipid ' + clipinfo.clipid + ' ' + send_form.comment, {group: sms_report }, null);
                                       smscall('[cp] ' + clipinfo.corporatorcode + ' ' + clipinfo.originid + ' ' + smsmsg, {group: sms_report }, null);
                                   }
                                   var retry_count = 0;
                                   async.doWhilst(
                                       function(doWhilst_callback) {
                                           async.waterfall([
                                               function(dowhile_waterfall_callback) {
                                                   // HTTP Post 전송을 수행한다
                                                    logger.debug("[CR] Report Form = " + JSON.stringify(send_form));
                                                    logger.debug("[CR] Progress report Start : " + clipinfo.report_url);
                                                   //logger.debug('[CR] Report Form Data = ' + JSON.stringify(send_form));

                                                    if(job.need_report == 0)
                                                    {
                                                        logger.debug("[CR] Report Success : (SKIP)");
                                                        dowhile_waterfall_callback(null, each_db_connection, clipinfo, '{"status":"skip"}');
                                                        return;
                                                    }
                                                   // reporter api 호출
                                                   report_result(clipinfo.report_url, send_form, function(request_err, response, body) {
                                                       if(request_err || response.statusCode !== 200) {
                                                           logger.error("[CR] HTTP Error or Status not 200 - SMS (ANALYTIC)");
                                                            if(!clipacquirereport_api_error[job.spid]) {
                                                                // error발생상황이 아니었던 경우 SMS 발송을 하고 상태를 error 상태로 바꾼다
                                                                clipacquirereport_api_error[job.spid] = true;
                                                                smscall('[api] clipacquirereport http error', {group: sms_group }, null);
                                                            }
                                                           //smscall('[api] ' + clipinfo.corporatorcode + ' ' + clipinfo.originid + ' clipacquirereport http error', {group: sms_group }, null);
                                                           // DB 의 Job report_status를 9로 설정한다

                                                           var sql_query = "UPDATE T_JOB set report_status=9, update_date=now() WHERE clipid='" + job.clipid + "' and job_id='" + job.job_id + "' AND spid='"+job.spid+"' AND cpid='"+job.cpid+"';";
                                                           logger.debug("[CR] " + sql_query);
                                                           each_db_connection.query(sql_query, function(err, result) {
                                                               if(err) {
                                                                   each_db_connection.release();
                                                                   // 앞쪽 Waterfall Error로 빠져나가야함
                                                                   logger.error("[CR] DB Update Query Error - SMS (ANALYTIC) : " + err);
                                                                   smscall('[acquire] ' + clipinfo.corporatorcode + ' clipid ' + clipinfo.clipid + '[acquire] DB Error Update T_JOB', {group: sms_admin_group }, null);
                                                                   each_waterfall_callback(new Error("[CR] DB Update Query Error - SMS (ANALYTIC) : " + err), null);
                                                               } else {
                                                                   // 앞쪽 Waterfall End로 빠짐
                                                                   each_db_connection.release();
                                                                   each_waterfall_callback(new Error('END'), null);
                                                               }
                                                           });
                                                       } else {
                                                           // HTTP POST Receive 성공
                                                           // 다음단계로 진행
                                                           logger.debug("[CR] Report Success : " + body);
                                                            // 성공한경우 이전 error 상태를 확인해서 error를 복구했다고 SMS 전송
                                                            if(clipacquirereport_api_error[job.spid]) {
                                                                // error발생상황이 아니었던 경우 SMS 발송을 하고 상태를 error 상태로 바꾼다
                                                                clipacquirereport_api_error[job.spid] = false;
                                                                smscall('[api] clipacquirereport http OK', {group: sms_group }, null);
                                                            }
                                                           dowhile_waterfall_callback(null, each_db_connection, clipinfo, body);
                                                       }
                                                    });
                                               },
                                               function(each_db_connection, clipinfo, body, dowhile_waterfall_callback) {
                                                   // Response를 확인한다
                                                   var response = null;
                                                   try {
                                                       var tab_removebody = body.replace(/\t/g, ' ');
                                                       //response = JSON.parse(body);
                                                       response = JSON.parse(tab_removebody);
                                                   } catch(err) {
                                                       if(body.status === undefined)
                                                       {
                                                       // JSON 파싱오류발생
                                                       each_db_connection.release();
                                                       // 앞쪽 Waterfall Error로 빠져나가야함
                                                       logger.error("[CR] JSON Parsing Error - SMS (ANALYTIC) : " + err);
                                                       smscall('[api] ' + clipinfo.corporatorcode + ' ' + clipinfo.originid + ' clipacquirereport json error', {group: sms_group }, null);
                                                       each_waterfall_callback(new Error("[CR] JSON Parsing Error - SMS : " + err), null);
                                                       return;
                                                       }
                                                       response = body;
                                                   }

                                                   if(response.status && response.status.toUpperCase() === 'SKIP')
                                                   {
                                                       dowhile_waterfall_callback(null, body);
                                                       return;
                                                   }
                                                   if(response.status === undefined || response.status === null || response.status.toUpperCase() !== 'OK') {
                                                       // 재시도를 하도록 한다
                                                       logger.debug("[CR] Response Not OK so Retry");
                                                       retry_count++;
                                                       doWhilst_callback(null);
                                                   } else {
                                                       // Job Status를 확인한다
                                                       var request_form = {
                                                           cpid: job.cpid,
                                                           clipid: clipinfo.originid,
                                                           type: 'recent',
                                                           acquire: 'F'
                                                       };
                                                       if(job.status === 70) {
                                                           // Y로 요청
                                                           if(media_usable === 0) {
                                                               request_form.acquire = 'Y';
                                                           }
                                                       }
                                                       logger.debug("[CR] Request Query = " + JSON.stringify(request_form));

                                                       // request api 호출
                                                       function cb_gethttpgetretry(err, result)
                                                       {
                                                           if(err)
                                                           {
                                                               logger.error("[CJ] Verify Error : " + err + " SMS (ANALYTIC)");
                                                               smscall('[api] ' + clipinfo.corporatorcode + ' ' + clipinfo.originid + ' clipacquirelist http error', {group: sms_group }, null);
                                                               // 강제로 retry_count를 5이상값을 넣어서 job status 변경작업을 하게 한다
                                                               retry_count = 99;
                                                               doWhilst_callback(null);
                                                           }else
                                                           {
                                                               // HTTP POST Receive 성공
                                                               logger.debug("[CR] Success : " + result.body);
                                                               var quot_fixbody = replaceAll('＂data＂', '"data"', result.body);
                                                               // 다음단계로 진행
                                                               dowhile_waterfall_callback(null, quot_fixbody);
                                                           }
                                                       }
                                                       gethttpgetretry(clipinfo.request_url, request_form, 120000, 1, cb_gethttpgetretry);
                                                   }
                                               },
                                               function(body, dowhile_waterfall_callback) {
                                                   var response = null;
                                                   var error_occurred = false;
                                                   try {
                                                       var tab_removebody = body.replace(/\t/g, ' ');
                                                       //response = JSON.parse(body);
                                                       response = JSON.parse(tab_removebody);
                                                   } catch(err) {
                                                       error_occurred = true;
                                                       each_db_connection.release();
                                                       // 앞쪽 Waterfall Error로 빠져나가야함
                                                       logger.error("[CR] JSON Parsing Error - SMS (ANALYTIC) : " + err);
                                                       smscall('[api] ' + clipinfo.corporatorcode + ' ' + clipinfo.originid + ' clipacquirelist json error', {group: sms_group }, null);
                                                       each_waterfall_callback(new Error("[CR] JSON Parsing Error - SMS : " + err), null);
                                                       return;
                                                   }

                                                   if(!error_occurred) {
                                                        // response가 여러개가 있을수 있으므로 그중에서 clipid가 같고 acquire값이 같은 데이터가 있는지 확인한다
                                                        var find = false;
                                                   if(!response.status || response.status.toUpperCase() !== 'SKIP')
                                                   {
                                                        var data = response.data;
                                                        if(data.length > 0) {
                                                            for(var i = 0 ; i < data.length ; i++) {
                                                                var cinfo = data[i];
                                                                logger.debug("[CR] cinfo = " + JSON.stringify(cinfo));
                                                                var setting_acquire = 'F';
                                                                if(job.status === 70) {
                                                                    // media check가 성공된것만 Y를 확인한다 - 20150327 추가
                                                                    if(media_usable === 0) {
                                                                        setting_acquire = 'Y';
                                                                    }
                                                                }
/*
 * TagStory 에서는 clipid가 아닌 contentid가 key 임
                                                                if(job.spid+'_'+cinfo.cpid+'_'+cinfo.clipid === job.clipid && cinfo.acquire === setting_acquire) {
                                                                    find = true;
                                                                    break;
                                                                }
/*/
                                                                if(job.spid+'_'+cinfo.cpid+'_'+cinfo.contentid === job.clipid && cinfo.acquire === setting_acquire) {
                                                                    find = true;
                                                                    break;
                                                                }
//*/
                                                            }
                                                        }
                                                    }else
                                                    {
                                                        find = true;
                                                    }

                                                        if(find) {
                                                            // 찾은 경우
                                                            // Status를 2로 변경하고 나간다
                                                            var sql_query = '';
/*
 * TagStory 에서만 일시적으로 69 오류 발생
 */
                                                            if(job.status === 69){
                                                                sql_query = "UPDATE T_JOB set status=69, err_message='Cannot COPY', report_status=2, update_date=now() WHERE clipid='" + job.clipid + "' and job_id='" + job.job_id + "' AND spid='"+job.spid+"' AND cpid='"+job.cpid+"' ;";
                                                            }else
/*
 * TagStory 에서만 일시적으로 69 오류 발생
 */
                                                            if(media_usable !== 0) {
                                                                // media checker에서 오류가 난경우는 status=79로 변경한다
                                                                if(media_usable === 1) {
                                                                    sql_query = "UPDATE T_JOB set status=79, err_message='MediaFile Unavaliable', report_status=2, update_date=now() WHERE clipid='" + job.clipid + "' and job_id='" + job.job_id + "' AND spid='"+job.spid+"' AND cpid='"+job.cpid+"';";
                                                                } else if(media_usable === 2) {
                                                                    sql_query = "UPDATE T_JOB set status=79, err_message='MediaFile Check JSON Broken', report_status=2, update_date=now() WHERE clipid='" + job.clipid + "' and job_id='" + job.job_id + "' AND spid='"+job.spid+"' AND cpid='"+job.cpid+"';";
                                                                } else {
                                                                    sql_query = "UPDATE T_JOB set status=79, err_message='MediaFile Checker Error', report_status=2, update_date=now() WHERE clipid='" + job.clipid + "' and job_id='" + job.job_id + "' AND spid='"+job.spid+"' AND cpid='"+job.cpid+"';";
                                                                }

                                                            } else {
                                                                sql_query = "UPDATE T_JOB set report_status=2, update_date=now() WHERE clipid='" + job.clipid + "' and job_id='" + job.job_id + "' AND spid='"+job.spid+"' AND cpid='"+job.cpid+"' ;";
                                                            }

                                                            logger.debug("[CR] " + sql_query);
                                                            each_db_connection.query(sql_query, function(err, result) {
                                                                if(err) {
                                                                    each_db_connection.release();
                                                                    // 앞쪽 Waterfall Error로 빠져나가야함
                                                                    logger.error("[CR] DB Update Query Error - SMS (ANALYTIC) : " + err);
                                                                    smscall('[acquire] ' + clipinfo.corporatorcode + ' clipid ' + clipinfo.clipid + ' DB UPDATE Error T_JOB', {group: sms_admin_group }, null);
                                                                    each_waterfall_callback(new Error("[CR] DB Update Query Error - SMS : " + err), null);
                                                                } else {
                                                                    // 앞쪽 Waterfall Success로 빠짐
                                                                    //each_db_connection.release();
                                                                    //each_waterfall_callback(new Error('END'), null);
                                                                    // T_CLIP_INFO 업데이트를 수행한다
                                                                    // meduaurl 생성 - job_updated_media_url을 사용한다
                                                                    // acquire 상태를 업데이트한다
                                                                    var acquire_status = 'F';
                                                                    if(job.status === 70) {
                                                                        if(media_usable === 0) {
                                                                            acquire_status = 'Y';
                                                                        }
                                                                    }
                                                                    var sql_query = 'UPDATE T_CLIP_INFO set mediaurl=\'' + update_media_url + '\', ';
                                                                    sql_query += 'playtime=' + job.playtime + ', ';
                                                                    sql_query += 'itemtypeid=' + job.itemtypeid + ', ';
                                                                    sql_query += 'content_length=' + job.content_length + ', ';
                                                                    sql_query += 'acquire=\'' + acquire_status + '\', ';
                                                                    sql_query += 'last_modified=\'' + job.last_modified + '\' ';
                                                                    sql_query += "WHERE clipid='" + job.clipid + "'";
                                                                    sql_query += "    AND spid='" + job.spid + "' ";
                                                                    sql_query += "    AND cpid='" + job.cpid + "'; ";
                                                                    logger.debug("[CR] " + sql_query);
                                                                    each_db_connection.query(sql_query, function(err, result) {
                                                                        if(err) {
                                                                            each_db_connection.release();
                                                                            // 앞쪽 Waterfall Error로 빠져나가야함
                                                                            logger.error("[CR] DB Update Query Error - SMS (ANALYTIC) : " + err);
                                                                            smscall('[acquire] ' + clipinfo.corporatorcode + ' clipid ' + clipinfo.clipid + ' DB UPDATE error T_CLIP_INFO', {group: sms_admin_group }, null);
                                                                            each_waterfall_callback(new Error("[CR] DB Update Query Error - SMS : " + err), null);
                                                                        } else {
                                                                            // 성공으로 빠져나간다 DB 연결 종료
                                                                            each_db_connection.release();
                                                                            logger.debug("[CR] Report Success & DB Update Success");
                                                                            each_waterfall_callback(null, 'SUCCESS');
                                                                        }
                                                                    });
                                                                }
                                                            });
                                                        } else {
                                                            // 못찾은 경우
                                                            // 재시도 한다
                                                            logger.debug("[CR] Report Data not applied...Retry");
                                                            retry_count++;
                                                            doWhilst_callback(null);
                                                        }

                                                   }
                                               }
                                           ],
                                           function(dowhile_waterfall_err, dowhile_waterfall_result) {

                                           }); // async.waterfall - dowhile
                                       },
                                       function() {
                                           // Retry 최대치에 다다랐는지 확인한다
                                           return retry_count < manager_config.max_num_retry;
                                       },
                                       function(err) {
                                           // 재시도 초과시 호출됨
                                           logger.debug("[CR] Retry Count Over");
                                           // Job Status 변경
                                           // Status를 5로 변경하고 나간다
                                           var sql_query = "UPDATE T_JOB set report_status=5, update_date=now() WHERE clipid='" + job.clipid + "' and job_id='" + job.job_id + "' AND spid='"+job.spid+"' AND cpid='"+job.cpid+"' ;";
                                           logger.debug("[CR] " + sql_query);
                                           each_db_connection.query(sql_query, function(err, result) {
                                               if(err) {
                                                   each_db_connection.release();
                                                   // 앞쪽 Waterfall Error로 빠져나가야함
                                                   logger.error("[CR] DB Update Query Error - SMS (ANALYTIC) : " + err);
                                                   smscall('[acquire] ' + clipinfo.corporatorcode + ' clipid ' + clipinfo.clipid + ' DB UPDATE error T_JOB', {group: sms_admin_group }, null);
                                                   each_waterfall_callback(new Error("[CR] DB Update Query Error - SMS : " + err), null);
                                               } else {
                                                   // 앞쪽 Waterfall End로 빠짐
                                                   each_db_connection.release();
                                                   each_waterfall_callback(new Error('END'), null);
                                               }
                                           });
                                       }
                                   ); // async.doWhilst
                               }
                           ],
                           function(each_waterfall_err, each_waterfall_result) {
                               if(each_waterfall_err) {
                                   logger.debug("[CR] 1 Skip Error : " + each_waterfall_err);
                               } else {
                                   logger.debug("[CR] 1 Job Success : " + each_waterfall_result);
                               }
                               logger.debug("[CR] " + job_count + " Jobs Reported");
                               job_count++;

                               each_series_callback(null, 'NEXT');
                           }); // async.waterfall in eachSeries
                       },
                       function(each_series_err, each_series_result) {
                           if(each_series_err) {
                               logger.error("[CR] Error : " + each_series_err + " - SMS (ANALYTIC)");
                               waterfall_callback(each_series_err, null);
                           } else {
                               logger.debug("[CR] Success");
                               waterfall_callback(null, 'All Jobs reported');
                           }
                       }); // async.each_series
                   }
               }
           });
       }
    ],
    function(waterfall_err, waterfall_result) {
        if(waterfall_err) {
            logger.error("[CR] Error : " + waterfall_err + " - SMS (ANALYTIC)");
        } else {
            // Success
            logger.debug("[CR] Success : " + waterfall_result);
        }
        logger.debug("[CR] Timer Setup : " + manager_config.report_data_polling_period + " sec");
        timerObj_clipinforeporter = setTimeout(clipinforeporter, manager_config.report_data_polling_period * 1000);
        if(timerObj_clipinforeporter === null || timerObj_clipinforeporter === undefined || timerObj_clipinforeporter === "") {
            // 혹시 NULL 나오면 즉시 SMS 알린다
            logger.error("[CR] Timer Setup Fail");
            smscall('[acquire] Reporter Timer Fail', {group: config.default_alert_group }, null);
        }
   }); // async.waterfall
}


// Util Functions
function getipaddress() {
    var interfaces = os.networkInterfaces();
    var addresses = [];
    for (var k in interfaces) {
        for (var k2 in interfaces[k]) {
            var address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    return addresses;
}

function getdatetimestring(datestring) {
    var datetimestring = datestring.substring(0,4) + '-' + datestring.substring(4,6) + '-' + datestring.substring(6,8) + ' ' + datestring.substring(8,10) + ':' + datestring.substring(10,12) + ':' + datestring.substring(12,14);
    return datetimestring;
}

function getDBConnection(caller_name, connection_callback) {
    // Master/Slave 상태에 따라서 한쪽의 db connection을 가져온다
    // DB Connection 가져오기
    logger.debug("[getDBConnection] Start Get DB Connection ======= " + caller_name);
    pool_master.getConnection(function(err, master_connection) {
        if(err) {
            logger.error("[getDBConnection] Master DB Fail..Failover to Backup");
            pool_backup.getConnection(function(err, backup_connection) {
                if(err) {
                    // Backup도 Dead
                    logger.error("[getDBConnection] All DB Connection Fail");
                    connection_callback(new Error("DB Fail - SMS"), null);
                    return;
                } else {
                    logger.debug("[getDBConnection] Backup Connection Selected");
                    connection_callback(null, backup_connection);
                    return;
                }
            });
        } else {
            logger.debug("[getDBConnection] Master Connection Selected");
            connection_callback(null, master_connection);
            return;
        }
    });
}

function geterrormsg(statuscode) {
    var errormsg = 'Internal Error';
    switch(statuscode) {
        case 0:
            errormsg = 'Ready';
            break;
        case 9:
            errormsg = 'Ready error';
            break;
        case 10:
            errormsg = 'Downloading';
            break;
        case 19:
            errormsg = 'downloading Error';
            break;
        case 20:
            errormsg = 'Transcoding';
            break;
        case 29:
            errormsg = 'Transcoding Error';
            break;
        case 30:
            errormsg = 'Copying to Storage';
            break;
        case 39:
            errormsg = 'Copying to Storage Error';
            break;
        case 70:
            errormsg = 'Processing Done';
            break;
    }
    return errormsg;
}

function replaceAll_old(find, replace, str)
{
    if(str === undefined || str === null || str === '') {
        return null;
    }

    while( str.indexOf(find) > -1)
    {
        str = str.replace(find, replace);
    }
    return str;
}

function replaceAll(find, replace, str)
{
    var returnstr = str.split(find).join(replace);
    return returnstr;
}

function mysqlsinglequote(str)
{
    var ret = replaceAll("'", "^^^^^", str);
    ret = replaceAll("^^^^^", "''", ret);
    return ret;
}

function smscall(msg, meta, callback) {
    logger.debug('[SMSCall] SMSCALL MSG="' + msg + '" TARGET=' + meta.group.join(','));
    // Message Filtering
    var no_sms = false;
    var sms_msg = msg;
    var now = new Date();

    var sms_filter_http_pattern = /clipacquirelist http error/;
    var sms_filter_json_pattern = /clipacquirelist json error/;
    var filter_list = null;

    /* sync 함수 */
    function duplicate_message_check(message, filters)
    {
        if(message in filters === false)
        {
            filters[message] = {ctime: now, count: 1};
            return false;
        }
        var call_count = filters[message].count + 1;
        filters[message] = {ctime: now, count: call_count};

        /* 정상 동작 시 중복 체크용 */
        clipacquirelist_api_error = true;
        /* 각 CP 별로 중복 전송 회피 */
        if(2 < call_count)
        {
            logger.debug('[SMSCall] Duplicate Message by '+call_count);
            return true;
        }
        return false;
    }

    if(sms_filter_http_pattern.test(msg))
    {
        filter_list = sms_filtering_http;
    }
    if(sms_filter_json_pattern.test(msg))
    {
        filter_list = sms_filtering_json;
    }
    if(null !== filter_list)
    {
/*
        if(clipacquirelist_api_error)
        {
            no_sms = true;
            if(filter_list === sms_filtering_json)
            {
                logger.debug('[SMSCall] status = clipacquirelist_api_error no SMS');
            }else
            {
                logger.debug('[SMSCall] SMS off');
            }
            if(callback) { callback(null, 'SMS off'); }
            return;
        }
*/
        no_sms = duplicate_message_check(msg, filter_list);
    }

    async.waterfall([
        function(waterfall_callback) {
            getDBConnection('SMSCall', function(err, dbConnection) {
                if(err) {
                    logger.error("[SMSCall] All DB Connection Fail - SMS (ANALYTIC)");
                    waterfall_callback(null, true, null);
                    return;
                } else {
                    logger.debug("[SMSCall] Get DB Connection Success");
                    waterfall_callback(null, false, dbConnection);
                    return;
                }
            });
        },
        function(skip, db_connection, waterfall_callback) {
            if(skip)
            {
                waterfall_callback(null, 2);
                return;
            }

            var sql_query = 'SELECT * FROM T_DATA_MANAGER_CONFIG LIMIT 1';
            logger.debug(sql_query);
            db_connection.query(sql_query, function(err, result) {
                    if(err) {
                        // DB Query Error
                        db_connection.release();
                        logger.error("DB Error = " + err);
                        waterfall_callback(null, 3);
                        return;
                    } else {
                        db_connection.release();
                        if(result[0].sms_alarm !== null && result[0].sms_alarm !== undefined && result[0].sms_alarm !== '') {
                            if(result[0].sms_alarm === 'Y') {
                                waterfall_callback(null, 0);
                                return;
                            } else {
                                waterfall_callback(null, 1);
                                return;
                            }
                        } else {
                            waterfall_callback(null, 4);
                            return;
                        }
                    }
                });
        },
        function(status, waterfall_callback) {
            if(status !== 0 || no_sms)
            {
                waterfall_callback(new Error('SMS off'), null);
                return;
            }

            // SMS URL 변경 - 2015/07/27 김재홍
            var get_form = {
                url: 'http://211.233.68.197:8080/send_msg/send_sms.php',
                qs: {
                    id: 'solbox',
                    pw: 'solutionbox00',
                    pn: meta.group.join(','),
                    cb: '0221823695',
                    msg: '[LGU+]' + sms_msg
                },
                useQuerystring: true,
                timeout: 30000
            };

            if(config.runmode !== 'normal') {
//                get_form.qs.pn = ['acquire.sd'];
                get_form.qs.msg = '[DEV]' + get_form.qs.msg;
            }

            request.get(get_form, function(request_err, response, body)
                    {
                        if(request_err)
                        {
                            waterfall_callback(request_err, null);
                            return;
                        }
                        if(response.statusCode !== 200)
                        {
                            waterfall_callback(new Error('response : ' + response.statusCode), null);
                            return;
                        }
                        waterfall_callback(null, 'SUCCESS');
                        return;
                    });
        }
    ], function(waterfall_err, waterfall_result) {
        if(waterfall_err) {
            logger.debug('[SMSCall] ' + waterfall_err);
        } else {
            logger.debug('[SMSCall] Send Success');
        }
        if(callback !== null)
        {
            callback(waterfall_err, waterfall_result);
        }
    });
}

// 분리함수
function gethttpgetretry(request_url, query_string, timeout, retrycount, callback)
{
    // 매개변수 검사
    if(query_string === undefined || query_string === null || query_string === '')
    {
        callback(new Error('query_string undefined'), null);
        return;
    }
    if(request_url == undefined || request_url == '')
    {
        request_url = config.smc_clipinfo_request_url;
    }
/*
 * TagStory 에서는 clipid가 아닌 contentid가 key 임
 */
    var mod_qs =
    {
        cpid: query_string.cpid,
        contentid: query_string.clipid,
        type: query_string.type,
        acquire: query_string.acquire
    };
/*
 * TagStory 에서는 clipid가 아닌 contentid가 key 임
 */

    logger.debug('[GETHTTPGETRETRY] url="' + request_url + '" data=' + JSON.stringify(mod_qs) + 'timeout=' + timeout);

    // 입수 목록 요청
    function callback_async_task(retrytaskcallback, retryresult)
    {
        // clipinfo 수신 성공 여부 확인. 실패 시 반복할 수 있도록 retrytaskcallback() 호출 등록
        function callback_request(err, response, body)
        {
            var result =
            {
                statuscode: 0,
                response: null,
                body: null
            };

            var interval = 2000;

            function set_timer()
            {
                retrytaskcallback(err, result, interval);
            }
            if(err || response.statusCode !== 200)
            {
                // HTTP 오류시 건너뛰기
                // 2초후에 Retry 시도를 한다

                if(err)
                {
                    set_timer();
//                    setTimeout(function(){ retrytaskcallback(err, { statuscode: 0, response: null, body: null});}, 2000);
                    return;
                }
                err = new Error(response.statusCode);
                result.statuscode = response.statusCode;
                set_timer();
//                setTimeout(function(){ retrytaskcallback(new Error(response.statusCode), { statuscode: response.statusCode, response: null, body: null});}, 2000);
                return;
            }
            result.statuscode = response.statusCode;
            result.response = response;
            result.body = body;
            retrytaskcallback(null, result);
        }

        // HTTP를 통한 clipinfo 수신
        var request_option =
        {
            url: request_url,
            qs: mod_qs,
            timeout: timeout
        }
        request.get(request_option, callback_request);
    }

    // 최종 결과 처리
    function callback_async_final(err, final_result)
    {
        if(err)
        {
            callback(err, null);
            return;
        }
        callback(null, final_result);
    }
    async.retry(retrycount, callback_async_task, callback_async_final);
}

// 처리 결과를 전송, 결과는 callback 함수를 바로 호출
function report_result(report_url, query_string, callback)
{
    var timeout = 120000;
    var mod_qs = {};
    if(query_string === undefined || query_string === null || query_string === '')
    {
        callback(new Error('query_string undefined'), null);
        return;
    }
    if(report_url == undefined || report_url == '')
    {
        report_url = config.smc_clipinfo_report_url;
    }
/*
 * TagStory 에서는 clipid가 아닌 contentid가 key 임
 */
    var mediaurl_len = 0;
    if('string' == typeof query_string.mediaurl)
    {
        mediaurl_len = query_string.mediaurl.length;
    }
    if(undefined !== query_string.clipid) { mod_qs.contentid = query_string.clipid; }
    if(undefined !== query_string.acquire) { mod_qs.acquire = query_string.acquire; }
    if(undefined !== query_string.comment) { mod_qs.comment = query_string.comment; }
    if(undefined !== query_string.mediaurl)
    {
        if(mediaurl_len > 9)
        {
            mod_qs.mediaurl = query_string.mediaurl.substring(9, mediaurl_len);
        }else
        {
            mod_qs.mediaurl = query_string.mediaurl; 
        }
    }
    if(undefined !== query_string.playtime) { mod_qs.playtime = query_string.playtime; }
/*
 * TagStory 에서는 clipid가 아닌 contentid가 key 임
 */
    logger.debug('[REPORT_RESULT] url=' + report_url + '/ qs=' + JSON.stringify(mod_qs) + 'timeout=' + timeout);

    var report_option =
    {
        url: report_url,
        qs: mod_qs,
        timeout: timeout
    }
    request.post(report_option, callback);
}

function mytrim(x) {
//    return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
    return x.replace(/^\s+|\s+$/gm,'');
}

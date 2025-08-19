// vim:set ts=8 sw=4 sts=4 et ai ci nu:
/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
const fs = require('fs');
const async = require('async');
const path = require('path');
var url = require('url');
var querystring = require('querystring');
const Api = require('./js/Api.js');
const Dbdata = require('./js/Dbdata.js');
const logger = require('./js/logger.js');
const util = require('./js/util.js');
const JobCreator = require('./js/job_creator.js');
const JobReporter = require('./js/job_reporter.js');
const job_handler = require('./js/job.js');

let config;
let dbdata;
let api;
var manager_config = {};
//var acquire_code = 1;

//var sms_admin_group = [];
let package_info;

/* 에러로 인하여 SMS 중복 전송 우려 */
let timerObj_clipinforeporter;

// SMS Filtering
let sms_filtering_http = {};
let sms_filtering_json = {};
/*
sms_filtering_http['[api] TAGSTORY clipacquirelist http error'] = { ctime: start_new, count: 0 };
sms_filtering_json['[api] TAGSTORY clipacquirelist json error'] = { ctime: start_new, count: 0 };
*/

//let current_status = 0;

job_handler.prev_init();
init();
regist_callback();

return;
function init()
{
    let config_file = '/usr/service/etc/transcode_data_manager.json';
    let input_seq;
    if(!!process.argv[2]){
        config_file = process.argv[2];
        input_seq = process.argv[3];
    }
    global.config = config = util.read_config(config_file, input_seq);

    global.dbdata = dbdata = new Dbdata(config.smc_db);
    global.api = api = new Api();
//config.acquire_code = acquire_code;
    logger.init_logger(config);
    logger.info('Data Manager Start at '+JSON.stringify(config.server_ip));

    global.job_creator = new JobCreator(config);
    global.job_reporter = new JobReporter(config);

    // Exception Handler
    process.on('uncaughtException', function (err) {
        logger.error('Caught exception: ' + err);
        if(err.stack) {
            logger.error('Stacktrace: ');
            logger.error(err.stack);
        }
        // 2015-07-08 긴급패치 jhkim
        util.smscall('[acquire] Exception Occurred CRITICAL', {group: config.default_alert_group }, null);
        process.exit(2);
    });
}


function regist_callback()
{
    async.waterfall(
        [
        function(cb_wf)
        {
            dbdata.get_data_manager_config(read_dbconfig_done);
            return;
            function read_dbconfig_done(err, result)
            {
                if(err){
                    logger.error("DB Error = "+JSON.stringify(err));
                    return cb_wf(err, null);
                }
                let manager_config = Object.assign({}, global.config);
                manager_config.clip_data_polling_period = result[0].clip_data_polling_period;
                manager_config.heartbeat_period = result[0].heartbeat_period;
                manager_config.heartbeat_timeout = result[0].heartbeat_timeout;
                manager_config.max_num_retry = result[0].max_num_retry;
                manager_config.need_copy_original = result[0].need_copy_original;
                manager_config.report_data_polling_period = result[0].report_data_polling_period;
                manager_config.old_data_force_batch_mode = result[0].old_data_force_batch_mode;
                manager_config.old_data_force_batch_mode_limit_day = result[0].old_data_force_batch_mode_limit_day;
                api.set_config(false, false, manager_config.max_num_retry, false, false);
                logger.debug("Get DB T_DATA_MANAGER Config Get Success");

                return cb_wf(null, manager_config);
            }
        },
        function(config, cb_wf) {
            global.job_creator.event_register(config);
            //logger.debug("Success Create ClipInfoReceiver_JobCreator");
            return cb_wf(null, config);
        },
        function(config, cb_wf)
        {
            global.job_reporter.event_register(config);
            //logger.debug("Success Create ClipInfoReporter");
            return cb_wf(null, config);
        }
        ],
        function(series_err)
        {
            if(series_err) {
                // 에러발생
                logger.crit("[CRITICAL] Error Occurred : " + series_err + "  .. exit");
                util.smscall('[acquire] cannot start...', {group: config.default_alert_group }, null);
                process.exit(1);
            } else {
                var ipaddress = util.getipaddress();
                logger.debug(JSON.stringify(manager_config));
                logger.debug("[DATA Manager] Start Success");
                util.smscall('[acquire] Data Manager (' + config.process_type + ') Started from ' + ipaddress[0], {group: config.default_alert_group }, null);
            }
        });
}




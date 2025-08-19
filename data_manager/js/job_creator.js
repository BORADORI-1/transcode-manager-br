// vim:set ts=8 sw=4 sts=4 et ai ci nu:

const async = require('async');
const job_handler = require('../js/job.js');
const util = require('../js/util.js');
const logger = require('../js/logger.js');

function JobCreator(config)
{
    this.event_info = {};
    let event_info = this.event_info;
    event_info.process = 'data_manager';
    event_info.event = 'job creator';
    event_info.sequence = config.acquire_sequence.index;
    event_info.address = config.server_ip;
    event_info.is_master = 'N';
    if(config.operation_mode == 'main'){
        event_info.is_master = 'Y';
    }
    event_info.status = 0;

    global.dbdata.register_event(this.event_info, function(err, res)
        {
            if(err){
                logger.error('JobCreator(): failed to insert event info '+err.toString());
            }
            logger.info('JobCreator(): ready');
        });
}

function jobcreator_event_register(config)
{
    let period = 5;
    if(!!this.is_shutdown){ return; }
    if(config && config.clip_data_polling_period){ period = config.clip_data_polling_period; }
    // Timer 복구
    logger.debug("[CJ] Timer Setup : " + period + " sec");
    this.timer_event = setTimeout(this.clipinforeceiver_jobcreator.bind(this), period * 1000);
    if(false === !!this.timer_event) {
        // 혹시 NULL 나오면 즉시 SMS 알린다
        logger.error("[CJ] Timer Setup Fail");
        if(!config) { config = global.config; }
        util.smscall('[acquire] JobCreator Timer Fail', {group: config.default_alert_group }, null);
    }
}

function jobcreator_shutdown()
{
    this.is_shutdown = true;
    clearTimeout(this.timer_event);
}

function clipinforeceiver_jobcreator()
{
    //let acquire_code = config.acquire_sequence.index;
    let manager_config = Object.assign({}, global.config);
    let enable_cp_count = 0;
    let cp_success_count = 0;

    logger.debug("[CJ] Start "+config.acquire_sequence.index);

    async.waterfall(
        [
        function(cb_wf)
        {
            dbdata.get_data_manager_config(cb_wf);
        },
        function(result, cb_wf)
        {
            manager_config.clip_data_polling_period = result[0].clip_data_polling_period;
            manager_config.heartbeat_period = result[0].heartbeat_period;
            manager_config.heartbeat_timeout = result[0].heartbeat_timeout;
            manager_config.max_num_retry = result[0].max_num_retry;
            manager_config.need_copy_original = result[0].need_copy_original;
            manager_config.report_data_polling_period = result[0].report_data_polling_period;
            manager_config.old_data_force_batch_mode = result[0].old_data_force_batch_mode;
            manager_config.old_data_force_batch_mode_limit_day = result[0].old_data_force_batch_mode_limit_day;
            api.set_config(false, false, manager_config.max_num_retry, false, false);
            cb_wf(null);
        },
        function(cb_wf)
        {
            util.check_event_info.call(this, manager_config, this.event_info, cb_wf);
        }.bind(this),
        function(cb_wf)
        {
            util.update_event_info.call(this, util.now_format('YYYY-MM-DD HH:mm:ss'), null, cb_wf);
        }.bind(this),
        function(cb_wf)
        {
            /* STEP 1 CP 목록 조회 */
            dbdata.get_cp_info_by_index(config.acquire_sequence.index, function(err, cp_info_list)
                {
                    if(err){
                        logger.error("[CJ] DB Select Query from T_CP_INFO Fail - SMS (ANALYTIC)" );
                        util.smscall("[acquire] DB Select Query Fail", {group: config.default_alert_group }, null);
                        cb_wf(err);
                        return;
                    }
                    if(cp_info_list.length <= 0){
                        logger.info("[CJ] No working target CP (code="+config.acquire_sequence.index+")");
                        cb_wf(new Error('skip'));
                        return;
                    }
                    enable_cp_count = cp_info_list.length;
                    cp_success_count = 0;
                    cb_wf(null, cp_info_list);
                });
        },
        function(cp_info_list, cb_wf)
        {
            async.each(cp_info_list, function(cp_info, cb)
                {
                    let sms_group = util.make_sms_group([cp_info.alert_admin_group]);
                    let sms_report = util.make_sms_group([cp_info.alert_group, cp_info.alert_admin_group]);
                    let sms_admin_group = util.make_sms_group([]);

                    cp_info.sms_group = sms_group;
                    cp_info.sms_report = sms_report;
                    cp_info.sms_admin_group = sms_admin_group;
                    if(false === !!cp_info.rules) { cp_info.rules = ''; }
                    this.job_create_by_cpinfo(manager_config, cp_info, function(err, is_success)
                        {
                            if(err){
                                if(is_success){
                                    logger.debug("[CJ] No Clip Data - Skip to Next Turn");
                                    cp_success_count++;
                                }else{
                                    logger.error("[CJ] Waterfall Error Out : " + err);
                                }
                            }else{
                                cp_success_count++;
                                logger.debug("[CJ] Waterfall Success : " + is_success);
                            }
                            logger.debug("[CJ] ************************** CP : " + cp_info.name + " END **********************************");
                            cb(null);
                        });
                }.bind(this),
                function(err)
                {
                    cb_wf(err, cp_info_list);
                });
        }.bind(this),
        function(cp_info_list, cb_wf)
        {
            logger.debug("[CJ] ************************** ALL CP DONE **********************************");
            logger.debug("[CJ] SUCCESS COUNT = " + cp_success_count);
            if((enable_cp_count > 0) && (cp_success_count === enable_cp_count)){
                // 전체가 성공이므로 메시지맵을 클리어한다
                logger.debug("[CJ] Clearing Msg Map");
                sms_filtering_http = {};
                sms_filtering_json = {};
                if(global.clipacquirelist_api_error){
                    // 만일 이전에 에러 상황이었으면 정상으로 돌리고 Recovery SMS를 날린다
                    logger.debug("[CJ] Recovery Status : Error -> Normal");
                    global.clipacquirelist_api_error = false;
                    util.smscall('[api] clipacquirelist OK', {group: config.default_alert_group }, null);
                }
            }
            logger.debug("[CJ] ALL CP Job Created");
            cb_wf(null);
            return;
        }
        ],
        function(err)
        {
            if(err){
                if(err.message != 'skip'){
                    logger.error('[CJ] jobcreator err = '+err);
                }
            }else{
                util.update_event_info.call(this, null, util.now_format('YYYY-MM-DD HH:mm:ss'), function(err)
                    {
                        logger.info('[CJ] jobcreator done');
                        this.event_register(manager_config);
                    }.bind(this));
                return;
            }
            this.event_register(manager_config);
        }.bind(this));
    return;
}

function job_create_by_cpinfo(config, cp_info, callback)
{
    logger.debug("[CJ] ************************** CP : " + cp_info.name + " START **********************************");
    async.waterfall(
        [
        function(cb_cp_wf) { cb_cp_wf(null, config, cp_info); },
        this.cp_make_request_info,
        this.cp_call_request,
        this.cp_check_response_format,
        this.cp_check_response_data,
        ],
        function(err, not_fault)
        {
            let is_success = false;
            if(err){
                if(not_fault){
                    logger.debug("[CJ] No Clip Data - Skip to Next Turn");
                    is_success = true;
                }else{
                    logger.error("[CJ] Waterfall Error Out : " + err);
                }
            }else{
                is_success = true;
                logger.debug("[CJ] Waterfall Success : " + not_fault);
            }
            logger.debug("[CJ] ************************** CP : " + cp_info.name + " END **********************************");
            return callback(null, is_success);
        });
    return;
}

function cp_make_request_info(config, cp_info, callback)
{
    let api_list = cp_info.api;
    let default_form = {
        cpid: cp_info.cpid,
        clipid: '',
        type: 'recent',
        acquire: 'N'
    };
    if(!api_list || api_list.length <= 0){
        callback(null, config, cp_info, default_form);
        return;
    }
    let request_form = {};
    async.each(api_list,
        function(entry, cb_ea)
        {
            if(entry.type != 'request') {
                cb_ea(null); return;
            }
            util.data_convert_entry(request_form, entry, default_form, cb_ea);
            return;
        },
        function(err)
        {
            callback(null, config, cp_info, request_form);
        });
}

function cp_call_request(config, cp_info, request_form, callback)
{
    api.request(cp_info.request_url, request_form, null, null, function(err, data)
        {
            if(err){
                callback(err, false, cp_info);
                return;
            }
            callback(null, config, cp_info, data);
        });
}

function cp_check_response_format(config, cp_info, http_result, callback)
{
    if(typeof(http_result.body) == 'string'){
        logger.debug("[CJ] clipacquirelist call Success : "+http_result.body);
        let tab_removebody = http_result.body.replace(/\t/g, ' ');
        let quot_fixbody = util.replaceAll('＂data＂', '"data"', tab_removebody);
        let body_data = null;

        try
        {
            body_data = JSON.parse(quot_fixbody);
        }catch(err)
        {
            logger.error("[CJ] Error : JSON Data Parsing Error");
            util.smscall("[api] " + cp_info.name + "("+cp_info.spid+") clipacquirelist json error", {group: cp_info.sms_group }, null);
            return callback(new Error("JSON Data Parsing Error - SMS"));
        }
    }else{
        logger.debug("[CJ] clipacquirelist call Success : "+JSON.stringify(http_result.body));
        if(typeof(http_result.body) != 'object'){
            return callback(new Error("JSON Data Parsing Error - SMS"));
        }
        body_data = http_result.body;
    }
    if(body_data.data === undefined){
        logger.error("[CJ] Error : JSON Data data field not exist - SMS (ANALYTIC/CMS)");
        util.smscall("[api] " + cp_info.name + "("+cp_info.spid+") clipacquirelist json error", {group: cp_info.sms_group }, null);
        return callback(new Error("JSON Data data field not exist - SMS (ANALYTIC/CMS)"));
    }
    let clipinfolist = body_data.data;
    if(false === !!clipinfolist || 1 > clipinfolist.length){
        // Data Empty Error
        // 데이터가 없는 경우 다음턴으로 간다.
        logger.debug("[CJ] Error : Empty Body");
        return callback(new Error('Empty Body'), true);
    }
    return callback(null, config, cp_info, clipinfolist);
}

function cp_check_response_data(config, cp_info, clip_list, callback)
{
    // clip_list 유효, 배열 크기 등은 전 단계에서 체크
    // clip_list 의 갯수만큼 반복한다
    logger.debug("[CJ] Total Target Clipinfo Count = " + clip_list.length);

    async.each(clip_list,
        function(clip_info, cb_clip_each)
        {
            /* 각 개별 컨텐츠의 단계별 작업 */
            job_handler.check_cp_response_data(config, cp_info, clip_info, cb_clip_each);
        },
        function(err)
        {
            if(err){
                logger.debug("[CJ] EachSeries_Waterfall Error Skip Error : " + toString(err));
                return callback(err, null);
            }
            logger.debug("[CJ] EachSeries Success");
            callback(null, 'SUCCESS');
        });
}

JobCreator.prototype.job_create_by_cpinfo = job_create_by_cpinfo;
JobCreator.prototype.clipinforeceiver_jobcreator = clipinforeceiver_jobcreator;
JobCreator.prototype.main_task = clipinforeceiver_jobcreator;
JobCreator.prototype.event_register = jobcreator_event_register;
JobCreator.prototype.shutdown = jobcreator_shutdown;

JobCreator.prototype.cp_make_request_info = cp_make_request_info;
JobCreator.prototype.cp_call_request = cp_call_request;
JobCreator.prototype.cp_check_response_format = cp_check_response_format;
JobCreator.prototype.cp_check_response_data = cp_check_response_data;

module.exports = JobCreator;

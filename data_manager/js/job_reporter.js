// vim:set ts=8 sw=4 sts=4 et ai ci nu:

const async = require('async');
const path = require('path');
const util = require('../js/util.js');
const logger = require('../js/logger.js');

function JobReporter(config)
{
    this.event_info = {};
    let event_info = this.event_info;
    event_info.process = 'data_manager';
    event_info.event = 'job reporter';
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
                logger.error('JobReporter(): failed to insert event info '+err.toString());
            }
            logger.info('JobReporter(): ready');
        });
}

function jobreporter_event_register(config)
{
    let period = 15;
    if(!!this.is_shutdown){ return; }
    if(config && config.report_data_polling_period){ period = config.report_data_polling_period; }
    // Timer 복구
    logger.debug("[CR] Timer Setup : " + period + " sec");
    this.timer_event = setTimeout(this.clipinforeporter.bind(this), period * 1000);
    if(false === !!this.timer_event) {
        // 혹시 NULL 나오면 즉시 SMS 알린다
        logger.error("[CR] Timer Setup Fail");
        if(!config) { config = global.config; }
        util.smscall('[acquire] Reporter Timer Fail', {group: config.default_alert_group }, null);
    }
}

function jobreporter_shutdown()
{
    this.is_shutdown = true;
    clearTimeout(this.timer_event);
}

function clipinforeporter()
{
    let manager_config = Object.assign({}, global.config);
    logger.debug("[CR] Start "+config.acquire_sequence.index);

    /* STEP r1 전체 처리 결과 보고 (MAIN) */
    async.waterfall([
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
        read_report_data,
        send_report_data.bind(this)
        ],
        report_done.bind(this));
    return;

    /* STEP r2 처리 결과 조회 */
    function read_report_data(cb_cr_wf)
    {
        dbdata.get_report_date(config.acquire_sequence.index, function(err, result)
            {
                if(err)
                {
                    logger.error("[CR] DB Select Query Error - SMS (ANALYTIC) : " + err);
                    util.smscall("[acquire] DB Select Fail T_JOB", {group: config.default_alert_group}, null);
                    return cb_cr_wf(new Error("[CR] DB Select Query Error - SMS (ANALYTIC) : " + err), null);
                }
                return cb_cr_wf(null, result);
            });
    }

    /* STEP r3 조회된 전체 처리 결과에 처리 */
    function send_report_data(report_data_list, cb_cr_wf)
    {
        if(0 >= report_data_list.length)
        {
            // 결과가 없는 경우 아무것도 하지 않는다
            // DB 연결 종료 후 Result로 Out
            logger.debug("[CR] No Report Job");
            return cb_cr_wf(null, 'No Report Job');
        }
        // 결과가 있는 경우 레코드 수만큼 반복처리한다
        logger.debug("[CR] Record Count = " + report_data_list.length);

        async.eachSeries(report_data_list, function(job, cb_job_each)
            {
                let sms_group = util.make_sms_group([job.alert_admin_group]);
                let sms_report = util.make_sms_group([job.alert_group, job.alert_admin_group]);
                let sms_admin_group = util.make_sms_group([]);
                job.sms_group = sms_group;
                job.sms_report = sms_report;
                job.sms_admin_group = sms_admin_group;
                this.send_report_data_2_cp(manager_config, job, cb_job_each);
            }.bind(this),
            function (err, each_result)
            {
    /* STEP r3-2 완료된 작업 별 처리 결과 처리 */
                if(err) {
                    logger.error("[CR] Error : " + err + " - SMS (ANALYTIC)");
                    return cb_cr_wf(err, null);
                }
                logger.debug("[CR] Success");
                return cb_cr_wf(null, "All Jobs reported");
            });
    }

    function report_done(err, wf_result)
    {
        if(err) {
            logger.error("[CR] Error : " + err + " - SMS (ANALYTIC)");
        }else {
            // Success
            logger.debug("[CR] Success : " + wf_result);
            util.update_event_info.call(this, null, util.now_format('YYYY-MM-DD HH:mm:ss'), function(err)
                {
                    this.event_register(manager_config);
                }.bind(this));
            return;
        }
        this.event_register(manager_config);
    }
}

function send_report_data_2_cp(config, job, callback)
{
    async.waterfall(
        [
        function(cb_wf){ return cb_wf(null, job); },
        this.read_rule_data,
        this.make_media_url,
        this.check_media_url,
        this.report_result,
        this.update_job_data,
        this.update_clip_data,
        ],
        function(err, result)
        {
            if(err){
                logger.error("[CR] Error : "+ util.toString(err) +" at clipid "+job.clipid);
            }
            callback(null);
        });
}

function read_rule_data(job, callback)
{
    if(70 !== job.status || false === !!job.rules){
        return callback(null, job, null);
    }
    global.dbdata.get_rules(job.rules, job.itemtypeid, read_rule_done);
    return;
    function read_rule_done(err, result)
    {
        if(err){
            logger.error("[CR] DB Select Query Error - SMS (ANALYTIC) : " + err);
            util.smscall("[acquire] DB Select Fail T_CLIP_INFO", { group: job.sms_admin_group }, null);
            return callback(new Error("[CR] DB Select Query Error - SMS (ANALYTIC) : " + err), null);
        }
        if(null == result){
            return callback(null, job, {});
        }
        if(0 >= result.length) {
            return callback(null, job, {});
/*
 *          logger.error("[CR] No Matched Rules Error - SMS (ANALYTIC) : " + job.itemtypeid + " : "+job.job_id);
 *          util.smscall("[acquire] No Match RuleInfo = "+ job.clipid, {group: job.sms_admin_group }, null);
 *          return cb_job_wf(new Error("[CR] No Matched RuleInfo Error - SMS (ANALYTIC) : " + job.clipid), null);
 */
        }
        return callback(null, job, result[0]);
    }
}

function make_media_url(job, rule, callback)
{
    let update_media_url = '';
    if(job.status !== 70){ return callback(null, job, update_media_url); }
    let originurl = job.originurl;
    let version = job.version_id;
    let itemtypeid = job.itemtypeid;
    let dotindex = originurl.lastIndexOf('.');
    let slashindex = originurl.lastIndexOf('/');
    let filenamebody = originurl.substring(0, dotindex);
    let cp_code = job.corporatorcode;
    if(!rule) { rule = {}; }
    let extension = rule.fpostfix;
    if(dotindex < slashindex) { filenamebody = originurl; }
    if(job.code !== undefined && job.code !== null){
        cp_code = job.code;
    }
    if(job.specify_mediaurl === 0){
        cp_code = '';
    }
    if(undefined === extension || null === extension){
        extension = originurl.substring(dotindex);
    }
    if(version === 1){
        update_media_url = path.normalize('/' + cp_code + '' + filenamebody + extension);
    }else{
        update_media_url = path.normalize('/' + cp_code + '' + filenamebody + '_v' + version + extension);
    }
    return callback(null, job, update_media_url);
}

function check_media_url(job, media_url, callback)
{
    if('normal' !== config.runmode) {
        return callback(null, job, media_url, true, null);
    }
    if(false === !!config.media_check_url) {
        return callback(null, job, media_url, true, null);
    }
    if(70 !== job.status) {
        return callback(null, job, media_url, true, null);
    }
    let request_form = {
        corporatorcode: job.corporatorcode,
        mediaurl: media_url
    };
    if(false === !!job.code){
        request_form.corporatorcode = job.code;
    }
    logger.debug('[CR] URL=' + config.media_check_url + '/ Request Form : ' + JSON.stringify(request_form));
    api.check_mediaurl(config.media_check_url, request_form, function(err, check_ok)
        {
            if(err || false === !!check_ok){
                return callback(null, job, media_url, false, err);
            }
            return callback(null, job, media_url, true, null);
        });
}

function report_result(job, media_url, check_ok, check_err, callback)
{
    if(job.need_report == 0){
        logger.debug('[CR] Report Success : (SKIP)');
        return callback(null, job, media_url, check_ok, check_err, '2');
    }
    let send_form = {
        cpid: job.cpid,
        clipid: job.originid,
        acquire: 'Y',
        comment: 'Acquire Done',
        mediaurl: media_url,
        originurl: job.originurl,
        playtime: job.playtime,
        playtime_ms: parseInt(job.playtime_ms)/1000,
        itemtypeid: job.itemtypeid
    };
    if(check_ok === false){
        let sms_msg = 'mediaurl error';
        send_form.acquire = 'F';
        send_form.comment = sms_msg;
        if(check_err){
            sms_msg = 'mediafile check error ('+check_err+')';
        }
        send_form.mediaurl = '';
        util.smscall("[acquire] " + job.corporatorcode + " clipid " + job.clipid + " " + sms_msg, {group: job.sms_admin_group }, null);
    }
    /* STEP r7-1 작업 결과가 정상인 경우 */
    if(job.status === 70){
        util.report_data(job.sms_group, job.report_url, job.request_url, send_form, job.report_type,
            global.clipacquirereport_api_error, job.spid, job.cpid, job.api, report_done);
        return;

    }
    /* STEP r7-2 작업 결과가 실패 경우 */
    send_form.acquire = 'F';
    send_form.comment = 'Acquire error';
    send_form.mediaurl = '';

    let sms_msg = send_form.comment;
    if(job.status === 19){
        if(job.err_message.indexOf('Not valid url') !== -1
            || job.err_message.indexOf('Not completely downloaded') !== -1){
            send_form.comment = job.err_message;
            sms_msg = 'file not found';
        }
        if(job.err_message.indexOf('socket hang up') !== -1){
            send_form.comment = job.err_message;
            sms_msg = 'CDN Connection Error';
        }
        if(job.err_message.indexOf('clip server does not respond') !== -1){
            send_form.comment = job.err_message;
            sms_msg = 'CDN Connection Error';
        }
    }
    if(job.status === 29){
        if(job.err_message.indexOf('Invalid') !== -1){
            send_form.comment = job.err_message;
            sms_msg = 'invalid file';
            if(job.err_message.indexOf('Height :') != -1){
                let colonindex = job.err_message.indexOf('Height :');
                let closeindex = job.err_message.lastIndexOf(')');
                let result = job.err_message.slice(colonindex + 'Height :'.length, closeindex);
                sms_msg = 'unsupported resolution ' + result;
            }
        }
    }
    util.smscall("[cp] " + job.corporatorcode + " " + job.originid + " " + sms_msg, {group: job.sms_report}, null);
    util.report_data(job.sms_group, job.report_url, job.request_url, send_form, job.report_type,
        global.clipacquirereport_api_error, job.spid, job.cpid, job.api, report_done);

    return;
    function report_done(report_err, request_err)
    {
        if(false === !!report_err){
            if(false === !!request_err){
                return callback(null, job, media_url, check_ok, check_err, 2);
            }
            if(util.toString(request_err).indexOf('Not Applied') !== -1){
                return callback(null, job, media_url, check_ok, check_err, 5);
            }
        }
        return callback(null, job, media_url, check_ok, check_err, 9);
    }
}

function update_job_data(job, media_url, check_ok, check_err, report_status, callback)
{
    let db_job = {
        job_id: job.job_id,
        spid: job.spid,
        cpid: job.cpid,
        clipid: job.clipid,
        report_status: report_status
    };
    if(false === check_ok){
        db_job.status = 79;
        db_job.err_message = 'MediaFile Unavaliable';
        if(check_err) { db_job.err_message = check_err; }
    }
    global.dbdata.update_job_info(db_job, update_done);
    return;
    function update_done(err)
    {
        if(err){
            logger.error("[CR] DB Update Query Error - SMS (ANALYTIC) : "+err);
            util.smscall("[acquire] "+job.corporatorcode+" clipid "+job.clipid+" DB UPDATE Error T_JOB", {group: job.sms_admin_group }, null);
            return callback(new Error("[CR] DB Update Query Error - SMS : " + err), null);
        }
        return callback(null, job, media_url, check_ok);
    }
}

function update_clip_data(job, media_url, check_ok, callback)
{
    let db_clip = {
        spid: job.spid,
        cpid: job.cpid,
        originid: job.originid,
        clipid: job.clipid,
        mediaurl: media_url,
        playtime: job.playtime,
        playtime_ms: job.playtime_ms,
        itemtypeid: job.itemtypeid,
        acquire: 'F'
    };
    if(job.status === 70 && true === check_ok){
        db_clip.acquire = 'Y';
    }
    if(true === !!job.content_length) { db_clip.content_length = job.content_length; }
    if(true === !!job.last_modified) { db_clip.last_modified = job.last_modified; }
    global.dbdata.update_clip_info(null, db_clip, update_done);
    return;
    function update_done(err)
    {
        if(err) {
            logger.error("[CR] DB Update Query Error - SMS (ANALYTIC) : "+err);
            util.smscall("[acquire] " + job.spid + ":" + job.corporatorcode + " clipid " + job.clipid + " DB UPDATE error T_CLIP_INFO", { group: job.sms_admin_group }, null);
            return callback(new Error('[CR] DB Update Query Error - SMS : ' + err), null);
        }
        logger.debug('[CR] Report Success & DB Update Success');
        return callback(null, 'SUCCESS');
    }
}

JobReporter.prototype.clipinforeporter = clipinforeporter;
JobReporter.prototype.main_task = clipinforeporter;
JobReporter.prototype.event_register = jobreporter_event_register;
JobReporter.prototype.shutdown = jobreporter_shutdown;

JobReporter.prototype.send_report_data_2_cp = send_report_data_2_cp;
JobReporter.prototype.read_rule_data = read_rule_data;
JobReporter.prototype.make_media_url = make_media_url;
JobReporter.prototype.check_media_url = check_media_url;
JobReporter.prototype.report_result = report_result;
JobReporter.prototype.update_job_data = update_job_data;
JobReporter.prototype.update_clip_data = update_clip_data;

module.exports = JobReporter;

// vim:set ts=8 sw=4 sts=4 et ai ci nu:

const fs = require('fs');
const async = require('async');
const moment = require('moment');
const path = require('path');
const url = require('url');
const querystring = require('querystring');
const axios = require('axios');
const util = require('./util.js');
const logger = require('./logger.js');

let clipacquirereport_api_error = {};
let clipacquirelist_api_error = false;

function prev_init()
{
    try{
        package_info = JSON.parse(fs.readFileSync('./package.json'));
    }catch(e){
        console.log('Failed to read package.json '+e.toString());
        process.exit(1);
    }

    global.version = package_info.name+'/'+package_info.version;
    global.clipacquirelist_api_error = clipacquirelist_api_error; // ???
    global.clipacquirereport_api_error = clipacquirereport_api_error;
}

function read_manager_config(callback)
{
    global.dbdata.get_data_manager_config(read_dbconfig_done);
    return;
    function read_dbconfig_done(error, result)
    {
        if(error){
            logger.error('DB Error = '+err);
            return callback(error, null);
        }
        let manager_config = {};
        manager_config.clip_data_polling_period = result[0].clip_data_polling_period;
        manager_config.heartbeat_period = result[0].heartbeat_period;
        manager_config.heartbeat_timeout = result[0].heartbeat_timeout;
        manager_config.max_num_retry = result[0].max_num_retry;
        manager_config.need_copy_original = result[0].need_copy_original;
        manager_config.report_data_polling_period = result[0].report_data_polling_period;
        manager_config.old_data_force_batch_mode = result[0].old_data_force_batch_mode;
        manager_config.old_data_force_batch_mode_limit_day = result[0].old_data_force_batch_mode_limit_day;
        global.api.set_config(false, false, manager_config.max_num_retry, false, false);
        return callback(null, manager_config);
    }
}

function check_operation_enable()
{
}

function read_cp_info(config, spid, cpid, callback)
{
    global.dbdata.get_cp_info_by_id(spid, cpid, read_data_done);
    return;
    function read_data_done(error, result)
    {
        if(error){
            logger.error('DB Error = '+err);
            callback(error, null, null);
            return ;
        }
        callback(null, config, result[0]);
    }
}

function merge_api_info_to_cp_info()
{
}

function convert_clip_info(config, cp_info, job_info, step_type, callback)
{
    let api_list = cp_info.api;
    if(!api_list || api_list.length <= 0){
        callback(null, config, cp_info, job_info);
        return;
    }
    if(step_type != 'request' && step_type != 'normalize' && step_type != 'response'){
        callback(new Error('abnormal status', config, cp_info, job_info));
        return;
    }
    let job_copy = JSON.parse(JSON.stringify(job_info));
    job_copy.extra_rule = null;
    job_info.added_data = {};
    job_info.added_data.cp_info = cp_info;
    //job_info.added_data.now_datetime = moment().format('YYYYMMDDHHmmss');
    job_info.added_data.now_datetime = util.now_format('YYYYMMDDHHmmss');
    job_info.added_data.originurl_basename = path.basename(job_info.originurl);
    job_info.added_data.originurl_dirname = path.dirname(job_info.originurl);
    job_info.added_data.originurl_dbj2_hash = util.dbj2_hash(job_info.originurl);
    job_info.added_data.originurl_basename_dbj2_hash = util.dbj2_hash(job_info.added_data.originurl_basename);
    async.each(api_list,
        function(entry, cb)
        {
            if(entry.type != step_type){
                setTimeout(cb, 0, null);
                return;
            }
            util.data_convert_entry(job_copy, entry, job_info, cb);
            return;
        },
        function(err)
        {
            callback(err, config, cp_info, job_copy);
        });
}

// check mandatory
function check_clip_entry(config, cp_info, job_info, callback)
{
    let no_error = true;
    let notallowext = false;
    if(undefined == job_info.cpid){
        logger.error("[CJ] Error : No cpid");
        no_error = false;
    }
    if(undefined == job_info.corporatorcode){
        logger.error("[CJ] Error : No corporatorcode");
        no_error = false;
    }
    if(undefined == job_info.clipid){
        logger.error("[CJ] Error : No clipid");
        no_error = false;
    }else{
        job_info.originid = job_info.clipid;
        job_info.clipid = cp_info.spid+"_"+cp_info.cpid+"_"+job_info.originid;
    }
    if(undefined === job_info.originurl) {
        logger.error("[CJ] Error : No originurl");
        no_error = false;
    }else{
        // 단순 경로인지 체크. 가끔 신규 고객의 경우 uri를 입력하는 경우가 있음
        job_info.originurl = util.mytrim(job_info.originurl);
        let col_index = job_info.originurl.indexOf(':');
        if(0 <= col_index) {
            logger.error("[CJ] Error : Found colon at originurl (" + job_info.originurl + ")");
            no_error = false;
        }
    }
    if(undefined === job_info.downloadurl){
        logger.error('[CJ] Error : No downloadurl');
        no_error = false;
    }else{
        // downloadurl의 프로토콜이 https인지 체크
        if('' !== job_info.downloadurl){
            let durl = url.parse(job_info.downloadurl);
            let check_name = querystring.unescape(durl.pathname.slice(durl.pathname.lastIndexOf('/')));
            if(!!durl.protocol && 'https:' !== durl.protocol && 'http:' !== durl.protocol){
                logger.error("[CJ] Error : Not Allowed Protocol ("+durl.protocol+")");
                no_error = false;
            }
            if(job_info.ignore_originurl_name == 'N' && job_info.originurl.slice(job_info.originurl.lastIndexOf("/")) !== check_name){
                logger.error('[CJ] Error : Not Allowed different filename ( originurl = '+job_info.originurl.slice(job_info.originurl.lastIndexOf('/'))
                    +", downloadurl = "+check_name+ ") ");
                no_error = false;
            }
        }
    }
    if(undefined === job_info.mediaurl){
        logger.error("[CJ] Error : No mediaurl");
        no_error = false;
    }
    if(undefined === job_info.regdate){
        logger.error("[CJ] Error : No regdate");
        no_error = false;
    }else if (0 <= job_info.regdate.indexOf('-')
            || 0 <= job_info.regdate.indexOf(':')){
        job_info.regdate = util.time_to_string(job_info.regdate);
        if(null === job_info.regdate) { no_error = false; }
    }
    if(undefined === job_info.modifydate){
        logger.error('[CJ] Error : No modifydate');
        no_error = false;
    }else if(0 <= job_info.modifydate.indexOf('-')
            || 0 <= job_info.modifydate.indexOf(':')){
        job_info.modifydate = util.time_to_string(job_info.modifydate);
        if(null === job_info.modifydate) { no_error = false; }
    }
    if(undefined === job_info.acquire){
        logger.error("[CJ] Error : No acquire");
        no_error = false;
    }
    if(undefined === job_info.priority){
        logger.error('[CJ] Error : No priority');
        no_error = false;
    }
    if(undefined === job_info.itemtypeid){
        logger.warning('[CJ] Warning : No itmetypeid');
        if(undefined === job_info.Itemtypeid){
            logger.warning('[CJ] Warning : No Itemtypeid');
            job_info.itemtypeid = '0';
        }else{
            job_info.itemtypeid = util.toString(job_info.Itemtypeid);
        }
    }else{
        job_info.itemtypeid = util.toString(job_info.itemtypeid);
    }
    job_info.playtime = util.to_number(job_info.playtime);
    job_info.starttime = util.to_number(job_info.starttime);
    job_info.endtime = util.to_number(job_info.endtime);
    job_info.targetage = util.to_number(job_info.targetage);
    job_info.cornerid = util.to_number(job_info.cornerid);
    job_info.cliporder = util.to_number(job_info.cliporder);
    if(false === !!job_info.cliptype){ job_info.cliptype = 'TZ'; }
    if(false === !!job_info.clipcategory) { job_info.clipcategory = '00'; }
    if(false === !!job_info.contentid) { job_info.contentid = job_info.clipid; }
    if(false === !!job_info.programid) { job_info.programid = job_info.programid; }
    if(false === !!job_info.programtitle) { job_info.programtitle = job_info.programid; }
    if(false === !!job_info.contenttitle) { job_info.contenttitle = job_info.contentid; }
    if(false === !!job_info.title){ job_info.title = cp_info.spid + '_' + job_info.clipid; }
    if(false === !!job_info.spid){ job_info.spid = cp_info.spid; }
    if(false === !!job_info.cpid){
        logger.error("[CJ] Error : Clip Data cpid not exist - SMS (ANALYTIC/CMS)");
        no_error = false;
    }
    if(false === !!job_info.clipid){
        logger.error("[CJ] Error : Clip Data clipid not exist - SMS (ANALYTIC/CMS)");
        no_error = false;
    }
    if(false === !!job_info.originid){
        logger.error("[CJ] Error : Clip Data originid not exist - SMS (ANALYTIC/CMS)");
        no_error = false;
    }
    if(false === !!job_info.originurl){
        logger.error("[CJ] Error : Clip Data originurl not exist - SMS (ANALYTIC/CMS)");
        no_error = false;
    }else{
/*
        if(job_info.originurl.indexOf('/') !== 0){
            job_info.originurl = '/' + job_info.originurl;
        }
*/
        let extdotindex = job_info.originurl.lastIndexOf('.');
        let extension = job_info.originurl.slice(extdotindex+1, job_info.originurl.length).toLocaleLowerCase();
        if(cp_info.ignore_originurl_name != 'N' && !!job_info.downloadurl){
            extdotindex = job_info.downloadurl.lastIndexOf('.');
            extension = job_info.downloadurl.slice(extdotindex+1, job_info.downloadurl.length).toLocaleLowerCase();
        }
        if(cp_info.allowextensions && cp_info.allowextensions.indexOf(extension) === -1){
            // 허용 확장자가 아닌 경우
            logger.error("[CJ] Error : Not Allowed Extension (" + extension + ") - SMS (ANALYTIC/CMS)");
            util.smscall('[acquire] [' + job_info.corporatorcode + '] not allowed extension (' + extension + ') ', {group: cp_info.sms_report }, null);
            no_error = false;
            notallowext = true;
        }
    }
    if(job_info.itemtypeid === null || job_info.itemtypeid === ''){
        logger.error("[CJ] Error : Clip Data itemtypeid not exist - SMS (ANALYTIC/SMC)");
        no_error = false;
    }
    if(job_info.priority === null || job_info.priority === ''){
        logger.error("[CJ] Error : Clip Data priority not exist - SMS (ANALYTIC/CMS)");
        no_error = false;
    }
    if(job_info.regdate === null || job_info.regdate === ''){
        logger.error("[CJ] Error : Clip Data regdate not exist - SMS (ANALYTIC/CMS)");
        no_error = false;
    }

    if(!no_error)
    {
        logger.error("[CJ] Error : Clip Data Error - SMS (ANALYTIC/CMS)");
        let errorinfo = {
                httpclip: job_info,
                dbclip: null,
                comment: 'Clip Data Error',
                group: cp_info.sms_group
            };
        if(notallowext){ errorinfo.comment = 'mediafile format error'; }
        return callback(new Error('Clip Data Error - SMS'), errorinfo);
    }
    logger.debug('[CJ] ClipInfo Validate Success');
    if(job_info.acquire !== 'N' && job_info.acquire !== 'n'){
        logger.debug("[CJ] acquire not 'N' or 'n' ... Skipping ");
        let errorinfo = 
            {
                httpclip: job_info,
                dbclip: null,
                comment: 'Acquire not N',
                group: cp_info.sms_admin_group
            };
        return callback(new Error('Acquire not N'), errorinfo);
    }
    if(job_info.cpid !== cp_info.cpid){
        // SELECT AL ?
        logger.debug("[CJ] Miss match cpid '"+job_info.cpid+"' != '"+cp_info.cpid+"' ");
        global.dbdata.get_cp_info_by_id(cp_info.spid, job_info.cpid, function(err, result)
            {
                if(err || 0 >= result.length){
                    logger.error("[CJ] No CPINFO for cpid="+job_info.cpid+" - SMS (ANALYTIC)");
                    let errorinfo = 
                        {
                            httpclip: job_info,
                            dbclip: null,
                            comment: 'Acquire error',
                            group: cp_info.sms_admin_group
                        };
                    return callback(new Error("No CP INFO for cpid="+job_info.cpid+" - SMS (ANALYTIC)"), errorinfo);
                }
                logger.debug("[CJ] Get CP Data from T_CP_INFO Success" + job_info.cpid);
                return callback(null, config, result[0], job_info);
            });
        return;
    }
    callback(null, config, cp_info, job_info);
}

function read_clip_history(config, cp_info, job_info, callback)
{
    let clip_info = null;
    let prev_job = null;
    global.dbdata.get_clip_info(job_info.clipid, read_clipinfo_done);
    return;
    function read_clipinfo_done(err, result)
    {
        if(err){
            logger.error("[CJ] DB Select Query Fail - SMS (ANALYTIC)");
            let errorinfo = 
                {
                    httpclip: job_info,
                    dbclip: null,
                    comment: 'Acquire error',
                    group: cp_info.sms_admin_group
                };
            return callback(new Error("DB Select Query Fail - SMS (ANALYTIC)"), errorinfo);
        }
        if(0 < result.length){
            clip_info = result[0];
        }
        global.dbdata.get_job_info_by_clipid(job_info.clipid, read_jobinfo_done);
        return;
    }

    function read_jobinfo_done(err, result)
    {
        if(err){
            logger.error("[CJ] DB Select Query Fail - SMS (ANALYTIC)");
            let errorinfo = {
                httpclip: job_info,
                dbclip: clip_info,
                comment: 'Acquire error',
                group: cp_info.sms_admin_group
            };
            return callback(new Error("DB Select Query Fail - SMS (ANALYTIC)"), errorinfo);
        }
        for(let i = 0; i < result.length; i++)
        {
            if(result[i].status == 70){
                prev_job = result[i];
            }
        }
        return callback(null, config, cp_info, job_info, clip_info, prev_job);
    }
}

function determine_clip_version(config, cp_info, job_info, prev_clip, prev_job, callback)
{
    let db_version = 0;
    let http_version = 0;
    let require_origin_check = true;

    job_info.current_downloadurl = '';
    if(!!job_info.downloadurl){
        job_info.current_downloadurl = job_info.downloadurl;
    }else{
        job_info.current_downloadurl = cp_info.source_path;
        if(job_info.originurl.indexOf('/') !== 0){
            job_info.current_downloadurl += '/';
        }
        job_info.current_downloadurl += job_info.originurl;
    }
    logger.debug("[CJ] DownloadURL = " + job_info.current_downloadurl);
    if(undefined !== cp_info.disable_version && 'Y' === cp_info.disable_version){
        return callback(null, config, cp_info, job_info, prev_clip, prev_job, 1, false);
    }
    if(true === !!job_info.mediaurl){
        http_version = util.get_version_at_mediaurl(job_info.mediaurl);
    }
    if(null === prev_clip){
        return callback(null, config, cp_info, job_info, prev_clip, prev_job, http_version + 1, false);
    }

    if(prev_job){
        db_version = prev_job.version_id;
    }else if(prev_clip.mediaurl){
        db_version = util.get_version_at_mediaurl(prev_clip.mediaurl);
    }
    if(job_info.originurl !== prev_clip.originurl){
        return callback(null, config, cp_info, job_info, prev_clip, prev_job, db_version + 1, false);
    }
    if(!prev_clip.mediaurl){
        if(prev_clip.acquire.toUpperCase() !== 'F'){
            /* maybe 'N' or 'P' or 'Y', but not 'Y' */
            let errorinfo = {
                httpclip: job_info,
                dbclip: prev_clip,
                comment: 'require duplicated',
                group: cp_info.sms_admin_group
            };
            return callback(new Error("New Clip Duplicated - SMS (ANALYTIC)"), errorinfo);
        }
        require_origin_check = false;
    }
    if(prev_clip.acquire.toUpperCase() === 'F'){
        require_origin_check = false;
    }
    if(db_version > http_version) {
        // 그냥 완료 보고 처리
        if(cp_info.allow_old_version){
            // not enable check
            return callback(null, config, cp_info, job_info, prev_clip, prev_job, db_version + 1, require_origin_check);
        }
/* DB 내 버전이 HTTP 요청에 기록된 버전보다 높은 경우 그냥 반환 */
        logger.debug("[CJ] HTTP Clipinfo("+http_version+") is lower version ("+db_version+")... Report Done");
        let report_form = {
            cpid: job_info.cpid,
            clipid: job_info.originid,
            acquire: 'Y',
            comment: 'Clip Already Downloaded',
            mediaurl: prev_clip.mediaurl,
            originurl: job_info.originurl,
            playtime: prev_clip.playtime,
            playtime_ms: parseInt(prev_clip.playtime_ms)/1000,
            itemtypeid: prev_clip.itemtypeid
        };
        if(!!prev_job){
            logger.debug('[CJ] Use JOB Data');
            report_form.playtime = prev_job.playtime;
            report_form.itemtypeid = prev_job.itemtypeid;
        }
        util.report_data(cp_info.sms_group, cp_info.report_url, cp_info.request_url, report_form, cp_info.report_type, global.clipacquirereport_api_error, cp_info.spid, cp_info.cpid, cp_info.api, report_done);
        return;
        function report_done(report_err, request_err)
        {
            let errorinfo;
            if(report_err) {
                errorinfo = {
                    httpclip: job_info,
                    dbclip: prev_clip,
                    comment: 'CMS Server Error',
                    group: cp_info.sms_group
                };
                return callback(new Error('No Job ClipInfo Report HTTP Error - SMS (ANALYTIC)'), errorinfo);
            }
            errorinfo = {
                httpclip: job_info,
                dbclip: prev_clip,
                comment: "http version lower then db",
                report_complete: true,
                group: cp_info.sms_group
            };
            return callback(new Error("Skip"), errorinfo);
        }
    }
    logger.debug("[CJ] HTTP Clipinfo is newer version .. Do Working");
    logger.debug("[CJ] ###2 Check Version Info = " + version);
    return callback(null, config, cp_info, job_info, prev_clip, prev_job, http_version + 1, require_origin_check);
}

function check_duplicate_operation(config, cp_info, job_info, prev_clip, prev_job, version, require_check, callback)
{
    if(!require_check){
        //callback(null, config, cp_info, job_info, prev_clip, prev_job, version);
        find_duplicate_job();
        return;
    }
    if(!prev_clip.content_length || !prev_clip.last_modified){
        //callback(null, config, cp_info, job_info, prev_clip, prev_job, version);
        find_duplicate_job();
        return;
    }
    dbdata.get_download_rule(cp_info.rules, read_download_rule_done);
    return;
    function read_download_rule_done(err, res)
    {
        let download_rule = null;
        if(!!err) {
            logger.error("[CJ] can't load download rule");
        }
        if(!!res && Array.isArray(res) && res.length > 0) {
            download_rule = res[0];
        }
        if(cp_info.origin_check != 'Y') {
            //return callback(null, config, cp_info, job_info, prev_clip, prev_job, version);
            return find_duplicate_job();
        }
        global.api.get_info(job_info.current_downloadurl, download_rule, read_get_origin_info_done);
    }
    function read_get_origin_info_done(err, response)
    {
        let errorinfo = {
            httpclip: job_info,
            dbclip: prev_clip,
            comment: "originurl cannot check",
            group: cp_info.sms_admin_group
        };
        if(err) {
            logger.error("[CJ] HTTP HEAD Request Error.... "+err.toString());
            logger.error("[CJ] HTTP HEAD Request Error....Skipping - SMS (ANALYTIC)");
            return callback(new Error("HTTP HEAD Request Error - SMS (ANALYTIC)"), errorinfo);
        }
        logger.warning("[CJ] finalresult=" + JSON.stringify(response));
        if(false === !!response) {
            return callback(new Error("[CJ] HTTP HEAD no response ... Skipping - SMS (ANALYTIC)"), errorinfo);
        }
        let headers = response.headers;
        let content_length = util.toString(headers["content-length"]);
        let last_modified = headers["last-modified"];
        if(false === !!content_length || false === !!last_modified) {
            return callback(new Error("HTTP HEAD not received HTTP content-length & last-modified - SMS (ANALYTIC)"), errorinfo);
        }
        if(false === !!util.toString(prev_clip.content_length) || undefined === prev_clip.last_modified || null === prev_clip.last_modified) {
            logger.error("[CJ] HTTP HEAD not contain content-length & last-modified Error....Skipping - SMS (ANALYTIC)");
            return callback(new Error("Can't check received HTTP content-length & last-modified - SMS (ANALYTIC)"), errorinfo);
        }
        logger.debug("[CJ] C/C = " + content_length + "/" + prev_clip.content_length);
        logger.debug("[CJ] L/L = " + last_modified + "/" + prev_clip.last_modified);
        if(util.toString(content_length) !== util.toString(prev_clip.content_length)
                || util.toString(last_modified) !== util.toString(prev_clip.last_modified)) {
            //callback(null, config, cp_info, job_info, prev_clip, prev_job, version);
            find_duplicate_job();
            return;
        }

        logger.debug("[CJ] Just Already Downloaded So Report Process");
        let report_form = {
            cpid: cp_info.cpid,
            clipid: prev_clip.originid,
            acquire: "Y",
            comment: "Clip Already Downloaded",
            mediaurl: prev_clip.mediaurl,
            originurl: job_info.originurl,
            playtime: prev_clip.playtime,
            playtime_ms: parseInt(prev_clip.playtime_ms)/1000,
            itemtypeid: prev_clip.itemtypeid
        };
        if(!!prev_job){
            logger.debug("[CJ] Use JOB Data");
            report_form.playtime = prev_job.playtime;
            report_form.itemtypeid = prev_job.itemtypeid;
        }
        logger.debug('[CJ] Report Form = ' + JSON.stringify(report_form));
        logger.debug('[CJ] Progress report Start : ' + config.smc_clipinfo_report_url);
        util.report_data(cp_info.sms_group, cp_info.report_url, cp_info.request_url, report_form, cp_info.report_type, global.clipacquirereport_api_error, cp_info.spid, cp_info.cpid, cp_info.api, report_done);
        return;
            
        function report_done(report_err, request_err)
        {
            if(report_err){
                logger.error("[CJ] Error : " + report_err + ' - SMS (ANALYTICS)');
                let errorinfo = {
                    httpclip: job_info,
                    dbclip: prev_clip,
                    comment: 'SMC Server Error',
                    group: cp_info.sms_admin_group
                };
                return callback(new Error('No Job ClipInfo Report HTTP Error - SMS (ANALYTIC)'), errorinfo);
            }
            let errorinfo = 
            {
                httpclip: job_info,
                dbclip: prev_clip,
                comment: 'Clip Already Downloaded',
                report_complete: true,
                group: cp_info.sms_group
            };
            return callback(new Error('skip'), errorinfo);
        }
    }
    function find_duplicate_job()
    {
        let target_path;
        let download_path;
        let file_name;
        //let target_path_temp = '/' + job_info.corporatorcode + '/' + job_info.originurl;
        let target_path_temp = '/' + job_info.corporatorcode;
        if(undefined !== cp_info.code && null !== cp_info.code){
            //target_path_temp = '/' + cp_info.code + '/' + job_info.originurl;
            target_path_temp = '/' + cp_info.code;
        }
        if(job_info.originurl.indexOf('/') !== 0){
            target_path_temp += '/';
        }
        target_path_temp += job_info.originurl;
        target_path = target_path_temp.substring(0, target_path_temp.lastIndexOf('/')+1);
        job_info.target_path = target_path;
        try{
            download_path = url.parse(job_info.current_downloadurl).pathname;
        }catch(e){
            logger.debug('[CJ] Warning downloadurl = '+ job_info.current_downloadurl + ', '+e.message);
            download_path = job_info.current_downloadurl;
        }
        try{
            //file_name = path.basename(download_path, path.extname(download_path));
            file_name = path.normalize(download_path);
        }catch(e){
            logger.debug('[CJ] Warning fault get filepath at download_path = '+ download_path);
            file_name = download_path;
        }
        dbdata.get_job_info_by_path(file_name, version, target_path, cp_info.spid, cp_info.cpid, find_duplicate_job_done);
        return;
    }
    function find_duplicate_job_done(err, result)
    {
        if(err){
            logger.error('[CJ] DB Select Query Fail - SMS (ANALYTIC)');
            util.smscall('[acquire] '+ job_info.corporatorcode + ' clipid ' + job_info.clipid + ' DB Error Select T_JOB', {group: cp_info.sms_admin_group }, null);
            let errorinfo = {
                httpclip: job_info,
                dbclip: null,
                comment: 'Acquire error (select from T_JOB)',
                group:  cp_info.sms_admin_group
            };
            return callback(new Error('DB Select Query Fail - SMS (ANALYTIC)'), errorinfo);
        }
        if(result.length > 0){
            job_info.conflict_job = result[0].job_id;
        }
        callback(null, config, cp_info, job_info, prev_clip, prev_job, version);
        return;
    }
}

function write_clip_info(config, cp_info, job_info, prev_clip, prev_job, version, callback)
{
    if(!prev_clip){
        dbdata.insert_clip_info(null, job_info, insert_clip_done);
        return;
    }
    dbdata.update_clip_info(null, job_info, update_clip_done);
    return;
    function insert_clip_done(err)
    {
        if(err) {
            logger.error("[CJ] DB Insert Query Fail : "+ err +" - SMS (ANALYTIC)");
            util.smscall("[acquire] " + job_info.corporatorcode + " clipid " + job_info.clipid + " DB Error Insert T_CLIP_INFO", {group: cp_info.sms_admin_group}, null);
            let errorinfo = {
                httpclip: job_info,
                dbclip: null,
                comment: "Acquire Error",
                group: cp_info.sms_admin_group
            };
            return callback(new Error("DB Insert Query Fail - SMS (ANALYTIC)"), errorinfo);
        }
        logger.debug("[CJ] T_CLIP_INFO Recode Insert Success");
        return callback(null, config, cp_info, job_info, version);
    }
    function update_clip_done(err)
    {
        if(err) {
            logger.error("[CJ] DB Update Query Fail : "+ err +" - SMS (ANALYTIC)");
            util.smscall("[acquire] " + job_info.corporatorcode + " clipid " + job_info.clipid + " DB Error Update T_CLIP_INFO", {group: cp_info.sms_admin_group}, null);
            let errorinfo = {
                httpclip: job_info,
                dbclip: null,
                comment: "Acquire Error",
                group: cp_info.sms_admin_group
            };
            return callback(new Error("DB Update Query Fail - SMS (ANALYTIC)"), errorinfo);
        }
        logger.debug("[CJ] T_CLIP_INFO Recode Update Success");
        return callback(null, config, cp_info, job_info, version);
    }
}

function create_job_info(config, cp_info, job_info, version, callback)
{
    let job_data = {};
    let default_priority = job_info.priority;
    if(config.old_data_force_batch_mode === 1) {
        if(false !== !!job_info.regdate){
            let clipregtime = new Date(util.getdatetimestring(job_info.regdate));
            let nowtime = new Date();
            let diffday = parseInt((nowtime - clipregtime) / (1000*3600*24));
            if(diffday >= config.old_data_force_batch_mode_limit_day){
                if(default_priority === 'N' || default_priority === 'n'){
                    logger.debug('[CJ] old file force batch mode setting... '+ diffday +' days');
                    default_priority = 'B';
                }
            }else{
                logger.debug('[CJ] normal mode...priority not changed = '+ default_priority);
            }
        }
    }

    job_data.clipid = job_info.clipid;
    job_data.spid = job_info.spid;
    job_data.cpid = job_info.cpid;
    job_data.rules = cp_info.rules;
    job_data.status = 0;
    job_data.report_status = 0;
    job_data.cliptype = job_info.cliptype;
    job_data.downloadurl = job_info.current_downloadurl;
    job_data.target_path = job_info.target_path;
    job_data.version_id = version;
    job_data.itemtypeid = job_info.itemtypeid;
    job_data.playtime = job_info.playtime;
    job_data.priority = default_priority;
    job_data.need_report = cp_info.need_report;
    job_data.need_copy_original = config.need_copy_original;
    job_data.num_retry = 0;
    if(job_info.extra_rule){
        job_data.extra_rule = job_info.extra_rule;
    }
/*
    if(job_data.downloadurl.indexOf('/') == 0){
        job_data.status = 20;
    }
*/
    if((false == !!cp_info.disable_version || 'Y' !== cp_info.disable_version) && true === !!job_info.conflict_job){
        job_data.related_job_id = job_info.conflict_job;
    }
/*
    callback(null);
    return;
*/
    dbdata.insert_job_info(job_data, insert_job_done);
    return;
    function insert_job_done(err, result)
    {
        if(err){
            logger.error("[CJ] T_JOB DB Insert Query Fail : " + err + " - SMS (ANALYTIC)");
            util.smscall('[acquire] ' + job_info.corporatorcode + ' clipid '+ job_info.clipid + ' DB Error Insert T_JOB', {group: cp_info.sms_admin_group }, null);
            let errorinfo = {
                httpclip: job_info,
                dbclip: null,
                comment: 'Acquire error (insert T_JOB)',
                group: cp_info.sms_admin_group
            };
            return callback(new Error('DB Insert Query Fail - SMS (ANALYTIC)'), errorinfo);
        }
        logger.debug('[CJ] T_JOB Record Insert Success');
        return callback(null, config, cp_info, job_info, 'P');
    }
}

function report_status(config, cp_info, job_info, acquire_status, callback)
{
    let report_form = {
        cpid: job_info.cpid,
        clipid: job_info.originid,
        acquire: acquire_status,
        comment: '',
        mediaurl: job_info.mediaurl,
        originurl: job_info.originurl,
        playtime: job_info.playtime,
        playtime_ms: Number(job_info.playtime_ms)/1000,
        itemtypeid: job_info.itemtypeid
    };
    if(acquire_status === 'P'){
        report_form.comment = 'Processing';
    }
    if(acquire_status === 'F'){
        report_form.comment = 'Acquire error';
    }

    if(!cp_info.need_report){
        logger.debug('[CJ] skip report ' + JSON.stringify(cp_info));
        let errorinfo = {
            httpclip: job_info,
            dbclip: null,
            comment: 'SUCCESS',
            report_complete: true,
            group: cp_info.sms_group
        };
        return callback(null, errorinfo);
    }
    util.report_data(cp_info.sms_group, cp_info.report_url, cp_info.request_url, report_form, cp_info.report_type,
        global.clipacquirereport_api_error, cp_info.spid, cp_info.cpid, cp_info.api, report_done);
    return;
    function report_done(report_err, request_err)
    {
        let errorinfo;
        if(report_err){
            errorinfo = {
                httpclip: job_info,
                dbclip: null,
                comment: 'CMS Server Error',
                group: cp_info.sms_group
            };
            return callback(new Error('ClipInfo Report HTTP Error - SMS (ANALYTIC)'), errorinfo);
        }
        errorinfo = {
            httpclip: job_info,
            dbclip: null,
            comment: 'SUCCESS',
            report_complete: true,
            group: cp_info.sms_group
        };
        return callback(null, errorinfo);
    }
}

function regist_job_by_ftp(job_info, callback)
{
    let err;
    logger.debug('[CJ] received message : ' + JSON.stringify(job_info));
    async.waterfall(
        [
        read_manager_config.bind(this),
        function(config, cb_wf){
            cb_wf(null, config, job_info.spid, job_info.cpid);
        },
        read_cp_info,
        function(config, cp_info, cb_wf){
            let sms_group = util.make_sms_group([cp_info.alert_admin_group]);
            let sms_report = util.make_sms_group([cp_info.alert_group, cp_info.alert_admin_group]);
            let sms_admin_group = util.make_sms_group([]);

            cp_info.sms_group = sms_group;
            cp_info.sms_report = sms_report;
            cp_info.sms_admin_group = sms_admin_group;
//            console.log('CP = '+JSON.stringify(cp_info));
            cb_wf(null, config, cp_info, job_info, 'normalize');
        },
        convert_clip_info,
        function(config, cp_info, job_info, cb_wf){
//            console.log('JOB = '+JSON.stringify(job_info));
            cb_wf(null, config, cp_info, job_info);
        },
        check_clip_entry,
        function(config, cp_info, job_info, cb_wf){
//            console.log('C = '+JSON.stringify(job_info));
            cb_wf(null, config, cp_info, job_info);
        },
        read_clip_history,
        function(config, cp_info, job_info, prev_clip, prev_job, cb_wf){
//            console.log('C1 = '+JSON.stringify(job_info)+','+JSON.stringify(prev_clip));
            cb_wf(null, config, cp_info, job_info, prev_clip, prev_job);
        },
        determine_clip_version,
        function(config, cp_info, job_info, prev_clip, prev_job, version_id, require_check, cb_wf){
//            console.log('V = '+version_id);
//            console.log('C1 = '+JSON.stringify(job_info)+','+JSON.stringify(prev_clip));
            cb_wf(null, config, cp_info, job_info, prev_clip, prev_job, version_id, require_check);
        },
        check_duplicate_operation,
        function(config, cp_info, job_info, prev_clip, prev_job, version_id, cb_wf){
//            console.log('C2 = '+version_id);
//            console.log('C1 = '+JSON.stringify(job_info)+','+JSON.stringify(prev_clip));
            cb_wf(null, config, cp_info, job_info, prev_clip, prev_job, version_id);
        },
        write_clip_info,
        function(config, cp_info, job_info, version_id, cb_wf){
//            console.log('C3 = '+job_info);
//            console.log('C1 = '+JSON.stringify(job_info)+','+JSON.stringify(prev_clip));
            cb_wf(null, config, cp_info, job_info, version_id);
        },
        create_job_info,
        report_status,
//function report_status()
        
        ],
        function(err)
        {
/*
            if(err){
            if(err.message == 'skip'){
                console.log(' SKIP ');
            }else{
                console.log(' ERROR ');
            }
            }else{
                console.log(' N ');
            }
*/
            callback(err);
        });
}

            //job_handler.check_cp_response_data(config, cp_info, clip_info, cb_clip_each);
function check_cp_response_data(config, cp_info, clip_info, callback)
{
    async.waterfall(
        [
        function(cb_wf){
            cb_wf(null, config, cp_info, clip_info);
        },
        function(config, cp_info, clip_info, cb_wf){
            convert_clip_info(config, cp_info, clip_info, 'normalize', cb_wf);
        },
        check_clip_entry,
        function(config, cp_info, job_info, cb_wf){
            cb_wf(null, config, cp_info, job_info);
        },
        read_clip_history,
        determine_clip_version,
        check_duplicate_operation,
        write_clip_info,
        create_job_info,
        function(config, cp_info, job_info, acquire_status, cb_wf){
            cb_wf(null, config, cp_info, job_info, acquire_status);
        },
        report_status,
/*
        function(config, cp_info, clip_info, cb)
        {
            return;
        },
*/
        ],
        function(err, result)
        {
            check_cp_response_data_done(err, result, cp_info, callback);
        });
}

function check_cp_response_data_done(err, errorinfo, cp_info, callback)
{
    if(false === !!err){
        logger.debug("[CJ] Registration Clip Success");
        callback(null);
        return;
    }
    logger.debug('[CJ] EachSeries_Waterfall Error Skip : ' + util.toString(err));
    // 없으면 보고 안하고 스킵한다.
    if(false === !!errorinfo) { return callback(null); }
    if(false === !!errorinfo.httpclip){ return callback(null); }
    if(true === errorinfo.report_complete){ return callback(null); }

    let http_clip = errorinfo.httpclip;
    let db_clip = errorinfo.dbclip;
    let comment = errorinfo.comment;
    let group = errorinfo.group;
    // originid (original clipid 가 없으면 보고 안하고 스킵한다.
    if(false === !!http_clip.clipid) { return callback(null); }

    let report_form = {
        cpid: http_clip.cpid,
        clipid: http_clip.clipid,
        acquire: 'F',
        comment: comment,
        mediaurl: '',
        originurl: http_clip.originurl,
        palytime: '',
        playtime_ms: 0,
        itemtypeid: ''
    };
    if(undefined !== http_clip.originid && null !== http_clip.originid && '' !== http_clip.originid) { report_form.clipid = http_clip.originid; }
    if(undefined !== http_clip.mediaurl && null !== http_clip.mediaurl) { report_form.mediaurl = http_clip.mediaurl; }
    if(undefined !== http_clip.playtime && null !== http_clip.playtime) { report_form.playtime = http_clip.playtime; }
    if(undefined !== http_clip.itemtypeid && null !== http_clip.itemtypeid) { report_form.itemtypeid = http_clip.itemtypeid; }
    //if(false !== !!db_clip && false !== !!db_clip.playtime) { report_form.playtime = db_clip.playtime; }
    if(util.toString(err).indexOf('HTTP HEAD') !== -1){
        // HTTP HEAD 관련 오류 발생 - 확인 안되는 경우 현재의 acquire 상태를 그대로 보고한다 (현재 DB)
        logger.debug('[CJ] Target ClipInfo = '+JSON.stringify(http_clip));
        if(false !== !!db_clip){
            if(undefined !== db_clip.acquire && null !== db_clip.acquire){ report_form.acquire = db_clip.acquire; }
            if(undefined !== db_clip.mediaurl && null !== db_clip.mediaurl) { report_form.mediaurl = db_clip.mediaurl; }
            if(undefined !== db_clip.playtime && null !== db_clip.playtime) { report_form.playtime = db_clip.playtime; }
            if(undefined !== db_clip.itemtypeid && null !== db_clip.itemtypeid) { report_form.itemtypeid = db_clip.itemtypeid; }
            report_form.comment = 'originurl cannot check';
        }
    }
    if(util.toString(err).indexOf('New Clip Duplicated') !== -1){
        // 신규로 중복되는 경우로써 이경우는 그대로 현재의 클립정보를 보고한다
        logger.debug("[CJ] Target ClipInfo = "+JSON.stringify(http_clip));
        if(false !== !!db_clip){
            if(undefined !== db_clip.acquire && null !== db_clip.acquire) { report_form.acquire = db_clip.acquire; }
            if(undefined !== db_clip.mediaurl && null !== db_clip.mediaurl) { report_form.mediaurl = db_clip.mediaurl; }
            if(undefined !== db_clip.playtime && null !== db_clip.playtime) { report_form.playtime = db_clip.playtime; }
            if(undefined !== db_clip.itemtypeid && null !== db_clip.itemtypeid) { report_form.itemtypeid = db_clip.itemtypeid; }
            report_form.comment = "request duplicated";
        }
    }
    if('N' === report_form.acquire) { report_form.acquire = "P"; }
    util.report_data(cp_info.sms_group, cp_info.report_url, cp_info.request_url, report_form, cp_info.report_type,
        global.clipacquirereport_api_error, cp_info.spid, cp_info.cpid, cp_info.api, report_done);
    return;
    function report_done(report_err, request_err)
    {
        if(report_err){
            return callback(null);
        }
        // DB 업데이트를 한다
        if(util.toString(err).indexOf("New Clip Duplicated") !== -1
                || util.toString(err).indexOf("HTTP HEAD") !== -1){
            // 다음턴으로 넘어간다
            // util.smscall("[acquire] " + targetcomment, {group: tergetgroup}, null);
            return callback(null);
        }
        // DB 업데이트가 필요한 경우
        logger.debug("[CJ] Fail Update to T_CLIP_INFO");
        dbdata.update_clip_info(null, 
            {
                clipid: http_clip.clipid,
                spid: cp_info.spid,
                cpid: http_clip.cpid,
                originid: http_clip.originid,
                acquire: 'F'
            }, function(err, result)
            {
                if(err){
                    //다음턴으로 넘어간다
                    logger.error("[CJ] DB Update Query Error - SMS (ANALYTIC) : " + util.toString(err));
                    util.smscall("[acquire] " + http_clip.corporatorcode + " clipid " + http_clip.clipid + " DB Update Error T_CLIP_INFO", {group: cp_info.sms_admin_group }, null);
                    return callback(null);
                }
                logger.error('[CJ] DB Fail Report Update Query Success');
                return callback(null);
            });
    }

}

exports.prev_init = prev_init;
exports.regist_job_by_ftp = regist_job_by_ftp;
exports.check_cp_response_data = check_cp_response_data;

// vim:set ts=8 sw=4 sts=4 et ai ci nu:
const mysql = require('mysql');
const path = require('path');
const async = require('async');
const logger = require('./logger.js');

function mysqlsinglequote(str)
{
    if(str === undefined || str === null) { return ""; }
    return str.toString().replace(/'/gi, "''");
}

function toString(s)
{
    if(s === undefined || s === null) { return ""; }
    return s.toString();
}

function Dbdata(config_db_info)
{
    var standby_config;
    this.pool_master = null;
    this.pool_slave  = null;

    this.pool_master = mysql.createPool(config_db_info.master);
    if(this.pool_master === undefined || this.pool_master === null || this.pool_master === '')
    {
        //return callback(new Error('Fault make pool for master'));
        console.log("[CRITICAL] Master DB POOL Make Fail");
        process.exit(1);
    }
    if(config_db_info.slave) { standby_config = config_db_info.slave; }
    if(config_db_info.backup) { standby_config = config_db_info.backup; }
    if(config_db_info.standby) { standby_config = config_db_info.standby; }
    if(!standby_config)
    {
        logger.debug('Dbdata(): disabled slave');
        return;
    }
    this.pool_slave = mysql.createPool(standby_config)
    if(this.pool_slave === undefined || this.pool_slave === null || this.pool_slave === '')
    {
        //return callback(new Error('Fault make pool for slave'));
        console.log("[CRITICAL] Backup DB POOL Make Fail");
        process.exit(1);
    }
    return;
}

function get_connection(callback)
{
    function cb_get_slave(error, conn)
    {
        if(error)
        {
            logger.error('get_connection : Failed to get connection of slave '+error);
        }
        return setTimeout(callback, 0, error, conn);
    }
    function cb_get_master(error, conn)
    {
        if(error)
        {
            logger.warning('get_connection : Failed to get connection of master '+error);
            if(this.pool_slave)
            {
                return this.pool_slave.getConnection(cb_get_slave.bind(this));
            }
            return setTimeout(callback, 0, error, conn);
        }
        return setTimeout(callback, 0, error, conn);
    }
    this.pool_master.getConnection(cb_get_master.bind(this));
}

function release_connection(conn)
{
    conn.release();
}

function end_pool(callback)
{
    function cb_master()
    {
        if(this.pool_slave)
        {
            return this.pool_slave.end(cb_slave);
        }
        if(callback)
        {
            return setTimeout(callback, 0);
        }
        return;
    }
    function cb_slave()
    {
        if(callback)
        {
            return setTimeout(callback, 0);
        }
        return;
    }
    if(this.pool_master)
    {
        return this.pool_master.end(cb_master.bind(this));
    }else
    {
        return cb_master().bind(this);
    }
}

/********************************************************************************
 *                                                                              *
 * callback은 항상 function(error, result, arg) 형식으로 사용                   *
 *                                                                              *
 ********************************************************************************/
function run_query(query_string)
{
    var ret_args = [];
    var callback = arguments[arguments.length-1];
    var i;
    if(2 > arguments.length) { callback = null; }
    for(i = 1; i < arguments.length-1; ++i) { ret_args[i+1] = arguments[i]; }

    logger.debug('run_query() : exec query "'+query_string+'"');
    return this.get_connection(run_query_exec.bind(this));

    function run_query_exec(error_1, db_conn)
    {
        function result_run_query(error_2, result)
        {
            if(error_2)
            {
                logger.warning('run_query : Failed to exec query "'+query_string+'" (err:'+error_2+')');
            }
            this.release_connection(db_conn); 
            if(callback)
            {
                ret_args[0] = error_2;
                ret_args[1] = result;
                setTimeout(function(){ callback.apply(null, ret_args); }, 0);
            }
//            ret_args = null;
            return;
        }

        if(error_1)
        {
            logger.error('run_query : Failed to get connection to DB '+error_1);
            if(callback)
            {
                ret_args[0] = error_1;
                ret_args[1] = null;
                setTimeout(function() { callback.apply(null, ret_args); }, 0);
            }
//            ret_args = null;
            return;
        }
        db_conn.query(query_string, result_run_query.bind(this));
    }
}

/* base function */
Dbdata.prototype.get_connection = get_connection;
Dbdata.prototype.release_connection = release_connection;
Dbdata.prototype.end_pool = end_pool;
Dbdata.prototype.end = end_pool;
Dbdata.prototype.run_query = run_query;

/* Query function */
function get_data_manager_config(callback)
{
    /* 조회할 fields */
    //var fields = ["job_polling_period", "storage_path", "original_path", "heartbeat_timeout", "check_path", "heartbeat_period", "job_wait_timeout", "sms_alarm", "search_count"];
    var fields = ["clip_data_polling_period", "report_data_polling_period", "need_copy_original", "heartbeat_period", "heartbeat_timeout", "max_num_retry", "old_data_force_batch_mode", "old_data_force_batch_mode_limit_day", "sms_alarm"];
    var query_string = "SELECT "+fields.join(', ')+" FROM T_DATA_MANAGER_CONFIG LIMIT 1";
    this.run_query(query_string, callback);
}

function read_event(process, sequence, event_name, callback)
{
    let query_string = 'SELECT process, event, is_master, sequence, address, status, wakeup_date, work_date FROM T_EVENT ';
    query_string += " WHERE process='"+process+"' AND event='"+event_name+"' AND sequence='"+sequence+"' ";
    this.run_query(query_string, callback);
}

function register_event(event_info, callback)
{
    let query_string = "INSERT INTO T_EVENT (process, event, is_master, sequence, address, status, wakeup_date, work_date) "+
        " VALUES ('"+event_info.process+"', '"+event_info.event+"', '"+event_info.is_master+"', '"+event_info.sequence+"', '"+event_info.address+"', '"+event_info.status+"', now(), null) "+
        " ON DUPLICATE KEY UPDATE is_master='"+event_info.is_master+"', status='"+event_info.status+"', wakeup_date=now()";
    this.run_query(query_string, callback);
}

function update_event(event_info, callback)
{
    let query_string = "UPDATE T_EVENT set is_master='"+event_info.is_master+"', status='"+event_info.status+"' ";

    if(!!event_info.wakeup_date){ query_string += ", wakeup_date='"+event_info.wakeup_date+"'"; }
    if(!!event_info.work_date){ query_string += ", work_date='"+event_info.work_date+"'"; }
    query_string += " WHERE process='"+event_info.process+"' AND event='"+event_info.event+"' AND sequence='"+event_info.sequence+"' AND address='"+event_info.address+"'";
    this.run_query(query_string, callback);
}

function check_master_action(acquire_index, callback)
{
    var fields = ["create_time", "type", "ip"];
    var query_string = "SELECT "+fields.join(', ')+", now() as cur_time FROM T_HEARTBEAT WHERE type='DM"+String(acquire_index)+"' ORDER BY create_time DESC limit 1";
    this.run_query(query_string, acquire_index, callback);
}

function set_footprint_action(acquire_index, ip_address, is_master, callback)
{
    var query_string = "INSERT INTO T_HEARTBEAT (create_time, type, ip) value (now(), ";
    acquire_index = String(acquire_index);
    if(is_master)
    {
        query_string += "'DM"+acquire_index+"'";
    }else
    {
        query_string += "'DS"+acquire_index+"'";
    }
    query_string += ", '"+ip_address+"');";
    this.run_query(query_string, is_master, callback);
}


/*
 * cpid, spid
 * none,
 */
function get_cp_info_by_id(spid, cpid, callback)
{
    /* 조회할 fields */
    var fields = ["spid", "cpid", "worker_group_id", "name", "code", "specify_mediaurl", "source_path", "report_type", "need_report", "need_acquire", "request_url", "report_url", "api_id", "rules", "thumbnail_rule_id", "allowextensions", "ignore_originurl_name", "origin_check", "storage_path", "need_smil", "alert_group", "alert_admin_group", "disable_version", "check_url_prefix"];
    var query_string = "SELECT "+fields.join(', ')+" FROM T_CP_INFO WHERE cpid='"+cpid+"' and spid='"+spid+"' limit 1;";

    //this.run_query(query_string, null, callback);
    this.run_query(query_string, function(err, result)
        {
            if(err){
                setTimeout(callback, 0, err, null);
                return;
            }
            setTimeout(this.get_api_rule.bind(this), 0, result, callback);
        }.bind(this));
}

function get_cp_info_by_index(acquire_index, callback)
{
    /* 조회할 fields */
    var fields = ["spid", "cpid", "worker_group_id", "name", "code", "specify_mediaurl", "source_path", "report_type", "need_report", "need_acquire", "request_url", "report_url", "api_id", "rules", "thumbnail_rule_id", "allowextensions", "ignore_originurl_name", "origin_check", "storage_path", "need_smil", "alert_group", "alert_admin_group", "disable_version", "check_url_prefix"];
    var query_string = "SELECT "+fields.join(', ')+" FROM T_CP_INFO WHERE need_acquire="+acquire_index+" and length(source_path) > 0;";

    //this.run_query(query_string, callback);
    this.run_query(query_string, function(err, result)
                    {
                        if(err)
                        {
                            setTimeout(callback, 0, err, null);
                            return;
                        }
                        setTimeout(this.get_api_rule.bind(this), 0, result, callback);
                    }.bind(this));
    return;
}

function insert_clip_info_use_array(arg, clipinfo, callback)
{
    var query_string_n = "";
    var query_string_v = "";
    /* insert 할 fields */
    var fields = ["programid", "programtitle", "cpid", "corporatorcode", "contentid", "cornerid", "contenttitle", "cliporder", "clipid", "originid", "spid", "title", "originurl", "mediaurl", "downloadurl", "itemtypeid", "cliptype", "clipcategory", "regdate", "modifydate", "playtime", "starttime", "endtime", "targetage", "acquire", "priority", "content_length", "last_modified"];

    if(!clipinfo.clipid || !clipinfo.spid || !clipinfo.cpid || !clipinfo.originid)
    {
        logger.error("insert_clip_info(): miss out key (clip:"+clipinfo.clipid+", sp:"+clipinfo.spid+", cp:"+clipinfo.cpid+")");
        return callback(new Error('miss out key for clipinfo'));
    }

    async.eachOf(clipinfo, merge_string, merge_end.bind(this));
    return;
    function merge_string(value, key, cb_eachof_iterate)
    {
        /* DB 필드에 해당하지 않는 항목들은 skip */
        if(fields.indexOf(key) == -1) { return cb_eachof_iterate(null); }
        if(query_string_n !== "")
        {
            query_string_n += ", ";
            query_string_v += ", ";
        }
        query_string_n += key;
        /* 숫자 및 단순 문자열을 별도로 처리해야할 필요를 못느끼므로 */
        query_string_v += "'" +mysqlsinglequote(toString(value))+"'";
        return cb_eachof_iterate(null);
    }
    function merge_end(err)
    {
        /* 에러 발생 시 */
        if(err) { return callback(err); }
        var query_string = "";
        query_string = "INSERT INTO T_CLIP_INFO("+query_string_n+") VALUES ("+query_string_v+");";
        this.run_query(query_string, arg, callback);
    }
}

function update_clip_info_use_array(arg, clipinfo, callback)
{
    var query_string = "";
    /* udate 할 fileds */
    //var fields = ["programid", "programtitle", "cpid", "corporatorcode", "contentid", "cornerid", "contenttitle", "cliporder", "clipid", "originid", "spid", "title", "originurl", "mediaurl", "downloadurl", "itemtypeid", "cliptype", "clipcategory", "regdate", "modifydate", "playtime", "starttime", "endtime", "targetage", "acquire", "priority", "content_length", "last_modified"];
    var data_fields = ["programid", "programtitle", "corporatorcode", "contentid", "cornerid", "contenttitle", "cliporder", "title", "originurl", "mediaurl", "downloadurl", "itemtypeid", "cliptype", "clipcategory", "regdate", "modifydate", "playtime", "playtime_ms", "starttime", "endtime", "targetage", "acquire", "priority", "content_length", "last_modified"];
    if(!clipinfo.clipid || !clipinfo.spid || !clipinfo.cpid || !clipinfo.originid)
    {
        logger.error("update_clip_info(): miss out key (clip:"+clipinfo.clipid+", sp:"+clipinfo.spid+", cp:"+clipinfo.cpid+")");
        return callback(new Error('miss out key for clipinfo'));
    }
    async.eachOf(clipinfo, merge_string, merge_end.bind(this));
    return;

    function merge_string(value, key, cb_eachof_iterate)
    {
        /* DB 필드에 해당하지 않는 항목들은 skip */
        if(data_fields.indexOf(key) == -1) { return cb_eachof_iterate(null); }
        if(query_string !== "")
        {
            query_string += ", ";
        }
        /* 숫자 및 단순 문자열을 별도로 처리해야할 필요를 못느끼므로 */
        query_string += key+"='"+mysqlsinglequote(toString(value))+"'";
        return cb_eachof_iterate(null);
    }
    function merge_end(err)
    {
        /* 에러 발생 시 */
        if(err) { return callback(err); }
        query_string = "UPDATE T_CLIP_INFO SET "+query_string+" WHERE clipid='"+mysqlsinglequote(clipinfo.clipid)+"' AND spid='"+mysqlsinglequote(clipinfo.spid)+"' AND cpid='"+mysqlsinglequote(clipinfo.cpid)+"' AND originid='"+mysqlsinglequote(clipinfo.originid)+"'; ";
        this.run_query(query_string, arg, callback);
    }
}

/*
function insert_clip_info(arg, clipinfo, callback)
{
    var query_string_n = "";
    var query_string_v = "";
    if(!clipinfo.clipid || !clipinfo.spid || !clipinfo.cpid || !clipinfo.originid)
    {
        logger.error("update_clip_info(): miss out key (clip:"+clipinfo.clipid+", sp:"+clipinfo.spid+", cp"+clipinfo.cpid+")");
        return callback(new Error('miss out key for clipinfo'));
    }
    query_string_n += "INSERT INTO T_CLIP_INFO (clipid, spid, cpid, originid";
    query_string_v += ") VALUES ( '"+mysqlsinglequote(clipinfo.clipid)+"', '"+mysqlsinglequote(clipinfo.spid)
        +"', '"+mysqlsinglequote(clipinfo.cpid)+"', '"+mysqlsinglequote(clipinfo.originid)+"'";

    if(clipinfo.programid)      {
        query_string_n += ", programid";
        query_string_v += ", '" +mysqlsinglequote(clipinfo.programid)+"'";
    }
    if(clipinfo.programtitle)   {
        query_string_n += ", programtitle";
        query_string_v += ", '"+mysqlsinglequote(clipinfo.programtitle)+"'";
    }
    if(clipinfo.corporatorcode) {
        query_string_n += ", corporatorcode";
        query_string_v += ", '"+mysqlsinglequote(clipinfo.corporatorcode)+"'";
    }
    if(clipinfo.contentid)      {
        query_string_n += ", contentid";
        query_string_v += ", '"+mysqlsinglequote(clipinfo.contentid)+"'";
    }
    if(clipinfo.cornerid)       {
        query_string_n += ", cornerid";
        query_string_v += ", '"+mysqlsinglequote(clipinfo.cornerid)+"'";
    }
    if(clipinfo.contenttitle)   {
        query_string_n += ", contenttitle";
        query_string_v += ", '"+mysqlsinglequote(clipinfo.contenttitle)+"'";
    }
    if(clipinfo.cliporder)      {
        query_string_n += ", cliporder";
        query_string_v += ", "+clipinfo.cliporder+"";
    }
    if(clipinfo.title)          {
        query_string_n += ", title";
        query_string_v += ", '"+mysqlsinglequote(clipinfo.title)+"'";
    }
    if(clipinfo.originurl)      {
        query_string_n += ", originurl";
        query_string_v += ", '"+mysqlsinglequote(clipinfo.originurl)+"'";
    }
    if(clipinfo.mediaurl)       {
        query_string_n += ", mediaurl";
        query_string_v += ", '"+mysqlsinglequote(clipinfo.mediaurl)+"'";
    }
    if(clipinfo.downloadurl)    {
        query_string_n += ", downloadurl";
        query_string_v += ", '"+mysqlsinglequote(clipinfo.downloadurl)+"'";
    }
    if(clipinfo.itemtypeid)     {
        query_string_n += ", itemtypeid";
        query_string_v += ", '"+clipinfo.itemtypeid+"'";
    }
    if(clipinfo.cliptype)       {
        query_string_n += ", cliptype";
        query_string_v += ", '"+mysqlsinglequote(clipinfo.cliptype)+"'";
    }
    if(clipinfo.clipcategory)   {
        query_string_n += ", clipcategory";
        query_string_v += ", '"+mysqlsinglequote(clipinfo.clipcategory)+"'";
    }
    if(clipinfo.regdate)        {
        query_string_n += ", regdate";
        query_string_v += ", '"+mysqlsinglequote(getdatetimestring(clipinfo.regdate))+"'";
    }
    if(clipinfo.modifydate)     {
        query_string_n += ", modifydate";
        query_string_v += ", '"+mysqlsinglequote(getdatetimestring(clipinfo.modifydate))+"'";
    }
    if(clipinfo.playtime)       {
        query_string_n += ", playtime";
        query_string_v += ", "+clipinfo.playtime+"";
    }
    if(clipinfo.starttime)      {
        query_string_n += ", starttime";
        query_string_v += ", "+clipinfo.starttime+"";
    }
    if(clipinfo.endtime)        {
        query_string_n += ", endtime";
        query_string_v += ", "+clipinfo.endtime+"";
    }
    if(clipinfo.targetage)      {
        query_string_n += ", targetage";
        query_string_v += ", "+clipinfo.targetage+"";
    }
    if(clipinfo.priority)       {
        query_string_n += ", priority";
        query_string_v += ", '"+mysqlsinglequote(clipinfo.priority)+"'";
    }
    if(clipinfo.acquire)       {
        query_string_n += ", acquire";
        query_string_v += ", '"+mysqlsinglequote(clipinfo.acquire)+"'";
    }

    var query_string = query_string_n + ") " + query_string_v + ")";
    this.run_query(query_string, arg, callback);
}

function update_clip_info(arg, clipinfo, callback)
{
    var query_string = "";
    if(!clipinfo.clipid || !clipinfo.spid || !clipinfo.cpid || !clipinfo.originid)
    {
        logger.error("update_clip_info(): miss out key (clip:"+clipinfo.clipid+", sp:"+clipinfo.spid+", cp"+clipinfo.cpid+")");
        return callback(new Error('miss out key for clipinfo'));
    }
    if(!clipinfo.acquire)
    {
        logger.error("update_clip_info(): miss out key (clip:"+clipinfo.clipid+", sp:"+clipinfo.spid+", cp"+clipinfo.cpid+")");
        return callback(new Error('miss out acquire for clipinfo'));
    }
    query_string += "UPDATE T_CLIP_INFO SET ";
    query_string += "acquire='"+mysqlsinglequote(clipinfo.acquire)+"'";
    if(clipinfo.programid)      { query_string += ", programid='"+mysqlsinglequote(clipinfo.programid)+"'"; }
    if(clipinfo.programtitle)   { query_string += ", programtitle='"+mysqlsinglequote(clipinfo.programtitle)+"'"; }
    if(clipinfo.corporatorcode) { query_string += ", corporatorcode='"+mysqlsinglequote(clipinfo.corporatorcode)+"'"; }
    if(clipinfo.contentid)      { query_string += ", contentid='"+mysqlsinglequote(clipinfo.contentid)+"'"; }
    if(clipinfo.cornerid)       { query_string += ", cornerid='"+mysqlsinglequote(clipinfo.cornerid)+"'"; }
    if(clipinfo.contenttitle)   { query_string += ", contenttitle='"+mysqlsinglequote(clipinfo.contenttitle)+"'"; }
    if(clipinfo.cliporder)      { query_string += ", cliporder="+clipinfo.cliporder+""; }
    if(clipinfo.title)          { query_string += ", title='"+mysqlsinglequote(clipinfo.title)+"'"; }
    if(clipinfo.originurl)      { query_string += ", originurl='"+mysqlsinglequote(clipinfo.originurl)+"'"; }
    if(clipinfo.mediaurl)       { query_string += ", mediaurl='"+mysqlsinglequote(clipinfo.mediaurl)+"'"; }
    if(clipinfo.downloadurl)    { query_string += ", downloadurl='"+mysqlsinglequote(clipinfo.downloadurl)+"'"; }
    if(clipinfo.itemtypeid)     { query_string += ", itemtypeid='"+clipinfo.itemtypeid+"'"; }
    if(clipinfo.cliptype)       { query_string += ", cliptype='"+mysqlsinglequote(clipinfo.cliptype)+"'"; }
    if(clipinfo.clipcategory)   { query_string += ", clipcategory='"+mysqlsinglequote(clipinfo.clipcategory)+"'"; }
    if(clipinfo.regdate)        { query_string += ", regdate='"+mysqlsinglequote(getdatetimestring(clipinfo.regdate))+"'"; }
    if(clipinfo.modifydate)     { query_string += ", modifydate='"+mysqlsinglequote(getdatetimestring(clipinfo.modifydate))+"'"; }
    if(clipinfo.playtime)       { query_string += ", playtime="+clipinfo.playtime+""; }
    if(clipinfo.starttime)      { query_string += ", starttime="+clipinfo.starttime+""; }
    if(clipinfo.endtime)        { query_string += ", endtime="+clipinfo.endtime+""; }
    if(clipinfo.targetage)      { query_string += ", targetage="+clipinfo.targetage+""; }
    if(clipinfo.priority)       { query_string += ", priority='"+mysqlsinglequote(clipinfo.priority)+"'"; }
    query_string += " WHERE clipid='"+mysqlsinglequote(clipinfo.clipid)+"' AND spid='"+mysqlsinglequote(cpinfo[0].spid)+"' AND cpid='"+mysqlsinglequote(clipinfo.cpid)+"' AND originid='"+mysqlsinglequote(clipinfo.originid)+"'; ";

    this.run_query(query_string, arg, callback);
}
*/

function get_clip_info(clipid, callback)
{
    /* 조회할 fields */
    var fields = ["programid", "programtitle", "cpid", "corporatorcode", "contentid", "cornerid", "contenttitle", "cliporder", "clipid", "originid", "spid", "title", "originurl", "mediaurl", "downloadurl", "itemtypeid", "cliptype", "clipcategory", "regdate", "modifydate", "playtime", "playtime_ms", "starttime", "endtime", "targetage", "acquire", "priority", "content_length", "last_modified"];
    var query_string = "SELECT "+fields.join(', ')+" FROM T_CLIP_INFO WHERE clipid='"+clipid+"'";

    this.run_query(query_string, clipid, callback);
}

function get_clip_info_by_originid(spid, cpid, originid, callback)
{
    /* 조회할 fields */
    var fields = ["programid", "programtitle", "cpid", "corporatorcode", "contentid", "cornerid", "contenttitle", "cliporder", "clipid", "originid", "spid", "title", "originurl", "mediaurl", "downloadurl", "itemtypeid", "cliptype", "clipcategory", "regdate", "modifydate", "playtime", "playtime_ms", "starttime", "endtime", "targetage", "acquire", "priority", "content_length", "last_modified"];
    var query_string = "SELECT "+fields.join(', ')+" FROM T_CLIP_INFO WHERE spid='"+spid+"' AND cpid='"+cpid+"' AND originid='"+originid+"'";

    this.run_query(query_string, null, callback);
}

function insert_job_info_use_array(job_info, callback)
{
    var query_string_n = "";
    var query_string_v = "";
    /* insert 할 fields */
// "create_date", "update_date",
    var fields = ["clipid", "spid", "cpid", "rules", "status", "report_status", "err_message", "worker_id", "encoding_time", "downloading_time", "cliptype", "downloadurl", "target_path", "version_id", "itemtypeid", "priority", "need_report", "need_copy_original", "related_job_id", "num_retry", "playtime", "content_length", "last_modified", "extra_rule"];

    if(!job_info.clipid || !job_info.spid || !job_info.cpid || !job_info.version_id)
    {
        logger.error("update_job_info(): miss out key (clip:"+String(job_info.clipid)+", sp:"+String(job_info.spid)+", cp:"+String(job_info.cpid)+", ver:"+String(job_info.version_id)+")");
        return callback(new Error('miss out key for job_info'));
    }
    if(!job_info.err_message){ job_info.err_message = ''; }
    async.eachOf(job_info, merge_string, merge_end.bind(this));
    return;

    function merge_string(value, key, cb_eachof_iterate)
    {
        /* DB 필드에 해당하지 않는 항목들은 skip */
        if(fields.indexOf(key) == -1) { return cb_eachof_iterate(null); }
        if(query_string_n !== "")
        {
            query_string_n += ", ";
            query_string_v += ", ";
        }
        query_string_n += key;
        /* 숫자 및 단순 문자열을 별도로 처리해야할 필요를 못느끼므로 */
        query_string_v += "'" +mysqlsinglequote(toString(value))+"'";
        return cb_eachof_iterate(null);
    }
    function merge_end(err)
    {
        /* 에러 발생 시 */
        if(err) { return callback(err); }
        var query_string = "";
        query_string = "INSERT INTO T_JOB("+query_string_n+") VALUES ("+query_string_v+");";
        this.run_query(query_string, job_info, callback);
    }
}

function update_job_info_use_array(job_info, callback)
{
    var query_string = "";
    /* udate 할 fileds */
    //var fields = ["clipid", "status", "report_status", "err_message", "worker_id", "encoding_time", "downloading_time", "create_date", "update_date", "cliptype", "downloadurl", "target_path", "version_id", "itemtypeid", "priority", "need_report", "need_copy_original", "related_job_id", "num_retry", "playtime", "content_length", "last_modified"];
    //var data_fields = ["status", "report_status", "err_message", "update_date"];
    var data_fields = ["status", "report_status", "err_message"];
    if(!job_info.clipid || !job_info.spid || !job_info.cpid || !job_info.job_id)
    {
        logger.error("update_job_info(): miss out key (clip:"+String(job_info.clipid)+", sp:"+String(job_info.spid)+", cp:"+String(job_info.cpid)+", id:"+String(job_info.job_id)+")");
        return callback(new Error('miss out key for job_info'));
    }
    async.eachOf(job_info, merge_string, merge_end.bind(this));
    return;

    function merge_string(value, key, cb_eachof_iterate)
    {
        /* DB 필드에 해당하지 않는 항목들은 skip */
        if(data_fields.indexOf(key) == -1) { return cb_eachof_iterate(null); }
        if(query_string !== "")
        {
            query_string += ", ";
        }
        /* 숫자 및 단순 문자열을 별도로 처리해야할 필요를 못느끼므로 */
        query_string += key+"='"+mysqlsinglequote(toString(value))+"'";
        return cb_eachof_iterate(null);
    }
    function merge_end(err)
    {
        /* 에러 발생 시 */
        if(err) { return callback(err); }
        if(query_string === "") { return callback(new Error("Invaid Data")); }
        query_string += ", update_date=now()";
        query_string = "UPDATE T_JOB SET "+query_string+" WHERE clipid='"+mysqlsinglequote(job_info.clipid)+"' AND spid='"+mysqlsinglequote(job_info.spid)+"' AND cpid='"+mysqlsinglequote(job_info.cpid)+"' AND job_id='"+mysqlsinglequote(job_info.job_id)+"'; ";
        this.run_query(query_string, job_info, callback);
    }
}

function get_job_info_by_clipid(clipid, callback)
{
    /* 조회할 fields */
    var fields = ["job_id", "clipid", "spid", "cpid", "rules", "status", "report_status", "err_message", "worker_id", "encoding_time", "downloading_time", "create_date", "update_date", "cliptype", "downloadurl", "target_path", "version_id", "itemtypeid", "priority", "need_report", "need_copy_original", "related_job_id", "num_retry", "playtime", "playtime_ms", "content_length", "last_modified", "extra_rule"];
    var query_string = "SELECT "+fields.join(', ')+" FROM T_JOB WHERE clipid='"+clipid+"' order by version_id desc, create_date desc limit 1;";

    this.run_query(query_string, clipid, callback);
}

function get_in_progress_job_info_by_clipid(clipid, callback)
{
    /* 조회할 fields */
    var fields = ["job_id", "clipid", "spid", "cpid", "rules", "status", "report_status", "err_message", "worker_id", "encoding_time", "downloading_time", "create_date", "update_date", "cliptype", "downloadurl", "target_path", "version_id", "itemtypeid", "priority", "need_report", "need_copy_original", "related_job_id", "num_retry", "playtime", "playtime_ms", "content_length", "last_modified", "extra_rule"];
    var query_string = "SELECT "+fields.join(', ')+" FROM T_JOB WHERE clipid='"+clipid+"' AND (status in (0, 10, 20, 30, 40, 50, 60, 11, 21, 31, 41, 51, 61) or report_status='0')  order by version_id desc, create_date desc ";

    this.run_query(query_string, clipid, callback);
}

function get_job_info_by_path(filename, versionid, target_path, spid, cpid, callback)
{
    /* 조회할 fields */
    var fields = ["job_id", "clipid", "spid", "cpid", "rules", "status", "report_status", "err_message", "worker_id", "encoding_time", "downloading_time", "create_date", "update_date", "cliptype", "downloadurl", "target_path", "version_id", "itemtypeid", "priority", "need_report", "need_copy_original", "related_job_id", "num_retry", "playtime", "playtime_ms", "content_length", "last_modified", "extra_rule"];
    var query_string = "SELECT "+fields.join(', ')+" FROM T_JOB WHERE downloadurl like '%/"+mysqlsinglequote(filename)+"' and version_id="+versionid+" and target_path='"+mysqlsinglequote(target_path)+"' and (status != '12' or report_status != '2') and related_job_id is NULL and spid='"+spid+"' and cpid='"+cpid+"' limit 1;";

    this.run_query(query_string, null, callback);
}

function check_duplication_job(filename, target_path, spid, cpid, clipid, callback)
{
    var fields = ["job_id", "clipid", "spid", "cpid", "rules", "status", "report_status", "err_message", "worker_id", "encoding_time", "downloading_time", "create_date", "update_date", "cliptype", "downloadurl", "target_path", "version_id", "itemtypeid", "priority", "need_report", "need_copy_original", "related_job_id", "num_retry", "playtime", "playtime_ms", "content_length", "last_modified", "extra_rule"];

    var query_string = "SELECT "+fields.join(', ')+" FROM T_JOB WHERE downloadurl like '%/"+mysqlsinglequote(filename)+"' and target_path='"+mysqlsinglequote(target_path)+"' and related_job_id is NULL and spid='"+spid+"' and cpid='"+cpid+"' and clipid!='"+clipid+"' limit 1;";

    this.run_query(query_string, null, callback);
}

/*
function get_job_info_by_status_end(acquire_index, callback)
{
    //var query_string = "SELECT * FROM T_JOB J, T_CP_INFO C WHERE J.status in (70, 9, 19, 29, 39) and J.report_status in (0, 5, 9) and J.cpid = C.cpid and J.spid = C.spid and C.need_acquire!='0';";
    //var query_string = "SELECT * FROM T_JOB J, T_CP_INFO C, T_CLIP_INFO I "
    var query_string = "SELECT C.cpid, C.spid, C.name, C.code, C.specify_mediaurl, C.report_type, C.request_url, C.report_url, C.api_id, C.need_smil, C.alert_group, C.alert_admin_group, I.corporatorcode, I.clipid, I.originid, I.originurl, J.job_id, J.rules, J.status, J.report_status, J.err_message, J.version_id, J.itemtypeid, J.need_report, J.need_copy_original, J.playtime, J.playtime_ms, J.content_length, J.last_modified FROM T_JOB J, T_CP_INFO C, T_CLIP_INFO I "
+" WHERE J.status in (70, 9, 19, 29, 39) and J.report_status in (0, 5, 9) "
+" and C.spid = I.spid and I.spid = J.spid and C.spid = J.spid "
+" and C.cpid = I.cpid and I.cpid = J.cpid and C.cpid = J.cpid "
+" and J.clipid = I.clipid ";
    if(acquire_index)
    {
        query_string += " and C.need_acquire='"+acquire_index+"'";
    }else
    {
        query_string += " and C.need_acquire!='0'";
    }
    //this.run_query(query_string, acquire_index, callback);
    this.run_query(query_string, function(err, result)
                    {
                        if(err)
                        {
                            setTimeout(callback, 0, err, null);
                            return;
                        }
                        setTimeout(this.get_api_rule.bind(this), 0, result, callback);
                    }.bind(this));
    return;
}
/*/
function get_job_info_by_status_end(acquire_index, callback)
{
    async.waterfall(
        [
            get_complete_or_error_job.bind(this),
            get_clip_info.bind(this),
            get_cp_info.bind(this),
            get_api_info.bind(this),
            merge_data.bind(this)
        ],
        function(err, result)
        {
            if(err){
                setTimeout(callback, 0, err, null);
                return;
            }
            setTimeout(callback, 0, null, result);
        }.bind(this));
    return;

    function get_complete_or_error_job(cb)
    {
        let fields = ["spid", "cpid", "clipid", "job_id", "rules", "status", "report_status", "err_message", "version_id", "itemtypeid", "need_report", "need_copy_original", "playtime", "playtime_ms", "content_length", "last_modified"];
        let query_string = "SELECT "+fields.join(', ')+" FROM T_JOB WHERE status in (70, 9, 19, 29, 39) and report_status in (0, 5, 9) ";
        if(!!acquire_index) {
            query_string += "and need_report = '"+acquire_index+"' ";
        }else{
            query_string += "and need_report != '0' ";
        }
        this.run_query(query_string, function(err, result)
            {
                if(err){
                    setTimeout(cb, 0, err);
                    return;
                }
                setTimeout(cb, 0, null, result);
            }.bind(this));
    }
    function get_clip_info(job_list, cb)
    {
        let fields = ["spid", "cpid", "clipid", "corporatorcode", "originid", "originurl"];
        let clipid_list = job_list.map(function(entry, index, array) { return entry.clipid; });
        let query_string = "SELECT "+fields.join(', ')+" FROM T_CLIP_INFO WHERE clipid in ('"+clipid_list.join("', '")+"') ";
        this.run_query(query_string, function(err, result)
            {
                if(err){
                    setTimeout(cb, 0, err);
                    return;
                }

                let clips = {};
                result.forEach(function(entry, index, array)
                    {
                        clips[entry.clipid] = entry;
                    });
                setTimeout(cb, 0, null, job_list, clips);
            }.bind(this));
    }
    function get_cp_info(job_list, clip_info, cb)
    {
        let fields = ["spid", "cpid", "name", "code", "need_acquire", "specify_mediaurl", "report_type", "request_url", "report_url", "api_id", "need_smil", "alert_group", "alert_admin_group"];
        let query_string = "SELECT "+fields.join(', ')+" FROM T_CP_INFO  ";
        this.run_query(query_string, function(err, result)
            {
                if(err) {
                    setTimeout(cb, 0, err);
                    return;
                }
                let cps = {};
                result.forEach(function(entry, index, array)
                    {
                        cps[entry.spid+'_'+entry.cpid] = entry;
                    });
                setTimeout(cb, 0, null, job_list, clip_info, cps);
            }.bind(this));
    }
    function get_api_info(job_list, clip_info, cp_info, cb)
    {
        var query_string = "SELECT api_id, type, name, value, datatype FROM T_API_ENTRY ";
        this.run_query(query_string, function(err, result)
            {
                if(err) {
                    setTimeout(cb, 0, err);
                    return;
                }
                let apis = {};
                result.forEach(function(entry, index, array)
                    {
                        if(!apis[entry.api_id]){
                            apis[entry.api_id] = [];
                        }
                        apis[entry.api_id].push(entry);
                    });
                setTimeout(cb, 0, null, job_list, clip_info, cp_info, apis);
            }.bind(this));
    }
    function merge_data(job_list, clip_info, cp_info, api_info, cb)
    {
        job_list.forEach(function(entry, index, array)
            {
                const job_clip_info = clip_info[entry.clipid];
                const job_cp_info = cp_info[entry.spid+'_'+entry.cpid];

                array[index].corporatorcode = job_clip_info.corporatorcode;
                array[index].originid = job_clip_info.originid;
                array[index].originurl = job_clip_info.originurl;

                array[index].name = job_cp_info.name;
                array[index].code = job_cp_info.code;
                array[index].need_acquire = job_cp_info.need_acquire;
                array[index].specify_mediaurl = job_cp_info.specify_mediaurl;
                array[index].report_type = job_cp_info.report_type;
                array[index].request_url = job_cp_info.request_url;
                array[index].report_url = job_cp_info.report_url;
                array[index].api_id = job_cp_info.api_id;
                array[index].need_smil = job_cp_info.need_smil;
                array[index].alert_group = job_cp_info.alert_group;
                array[index].alert_admin_group = job_cp_info.alert_admin_group;

                array[index].api = api_info[job_cp_info.api_id];
            });
        setTimeout(cb, 0, null, job_list);
    }
}
//*/

function get_api_rule(cp_list, callback)
{
    async.eachOf(cp_list, get_api_list.bind(this), return_result.bind(this));
    return;

    function get_api_list(cp_entry, key, cb_eachof_iterate)
    {
        async.waterfall([function(cb_wf){
                            setTimeout(get_api.bind(this), 0, cp_entry.api_id, cb_wf);
                            return;
                        }.bind(this)],
            function(err, result)
            {
                if(err)
                {
                    logger.error('get_api_rule : Failed to get api for '+cp_entry.cpid+'/'+cp_entry.spid+', '+err.toString());
                }
                if(!result || result.length == 0)
                {
                    return cb_eachof_iterate(null);
                }
                cp_list[key].api = result;
                setTimeout(cb_eachof_iterate, 0, null);
            });
        return;
    }
    function get_api(api_id, cb)
    {
        if(!api_id)
        {
            setTimeout(cb, 0, null, null);
            return;
        }
        var query_string = "SELECT type, name, value, datatype FROM T_API_ENTRY WHERE api_id='"+api_id+"' ";
        this.run_query(query_string, cb);
    }

    function return_result(err)
    {
        if(err)
        {
            logger.error('get_api_rule: fault '+err.toString());
        }
        setTimeout(callback, 0, null, cp_list);
    }
}

function get_rules(rules, itemtypeid, callback)
{
    var query_string;
    setTimeout(get_rule_group.bind(this), 0, rules, check_rule_group.bind(this));
    return;

    function get_rule_group(rule_group_id, cb)
    {
        query_string = "SELECT rule_group_id, download, transcode, thumbnail, upload FROM T_RULE_GROUP WHERE rule_group_id='"+rule_group_id+"'";
        this.run_query(query_string, cb);
    }
    function check_rule_group(err, res)
    {
        if(err)
        {
            logger.debug('get_rules(): Failed to get group');
            setTimeout(get_rule.bind(this), 0, rules, callback);
            return;
        }
        if(res.length <= 0)
        {
            setTimeout(get_rule.bind(this), 0, rules, callback);
            return;
        }
        if(!res[0].transcode)
        {
            return setTimeout(callback, 0, null, null);
        }
        setTimeout(get_rule.bind(this), 0, res[0].transcode, callback);
    }
    function get_rule(rules_list, cb)
    {
        query_string = "SELECT * FROM T_RULE where ruleid in ("+rules_list+") and itemtypeid = '"+itemtypeid+"' limit 1;";
        this.run_query(query_string, itemtypeid, cb);
    }
}

function get_download_rule(rule_group_id, callback)
{
    var query_string;
    setTimeout(get_rule_group.bind(this), 0, rule_group_id, get_download_rule_entry.bind(this));
    return;

    function get_rule_group(rule_group_id, cb)
    {
        query_string = "SELECT rule_group_id, download, transcode, thumbnail, upload FROM T_RULE_GROUP WHERE rule_group_id='"+rule_group_id+"'";
        this.run_query(query_string, cb);
    }
    function get_download_rule_entry(err, res)
    {
	if(err)
	{
            logger.debug('get_rules(): Failed to get group');
	    setTimeout(callback, 0, err, null);
	    return;
	}
	if(res.length <= 0 || !res[0].download)
	{
	    setTimeout(callback, 0, null, null);
	    return;
	}
        query_string = "SELECT download_rule_id, copy_origin, headers FROM T_DOWNLOAD_RULE where download_rule_id='"+res[0].download+"' limit 1;";
        this.run_query(query_string, callback);
    }
}

Dbdata.prototype.get_data_manager_config = get_data_manager_config;
Dbdata.prototype.set_footprint_action = set_footprint_action;
Dbdata.prototype.check_master_action = check_master_action;

Dbdata.prototype.read_event = read_event;
Dbdata.prototype.register_event = register_event;
Dbdata.prototype.update_event = update_event;

Dbdata.prototype.get_cp_info_by_id = get_cp_info_by_id;
Dbdata.prototype.get_cp_info_by_index = get_cp_info_by_index;

Dbdata.prototype.get_clip_info = get_clip_info;
Dbdata.prototype.insert_clip_info = insert_clip_info_use_array;
Dbdata.prototype.update_clip_info = update_clip_info_use_array;

Dbdata.prototype.get_job_info_by_clipid = get_job_info_by_clipid;
Dbdata.prototype.get_in_progress_job_info_by_clipid = get_in_progress_job_info_by_clipid;
Dbdata.prototype.get_job_info_by_path = get_job_info_by_path;
Dbdata.prototype.insert_job_info = insert_job_info_use_array;
Dbdata.prototype.update_job_info = update_job_info_use_array;

Dbdata.prototype.get_report_date = get_job_info_by_status_end;
Dbdata.prototype.get_api_rule = get_api_rule;
Dbdata.prototype.get_rules = get_rules;
Dbdata.prototype.get_download_rule = get_download_rule;

module.exports = Dbdata;

/*
var config = {
    "db_info" :
    {
        "master" :
        {
            "host": "192.168.111.111",
            "port": 3306,
            "database": "transcoding",
            "user": "ics2admin",
            "password": "ics!akstp"
        },
        "slave" :
        {
            "host": "192.168.111.111",
            "port": 3306,
            "database": "transcoding",
            "user": "ics2admin",
            "password": "ics!akstp"
        }
    }
};
function cb(error, result)
{
	if(error)
	{
	//console.log("error "+JSON.stringify(error));
	return ;
	}
    //console.log("result = "+JSON.stringify(result[0]));
    //console.log("results = "+JSON.stringify(result));
}
this.db_pool_init(config);
this.get_job(1, cb);
this.get_worker(1, cb);
this.get_rule('wj', 'WJ', cb);
*/

/*
exports.clear_remain_job = function(data, job_id, status, callback)
{
    **************
    var query_string = "update T_JOB set status='"+status+"' WHERE job_id='"+job_id+"'";
    result = run_query(query_string, data, callback);
    query_string = "update T_JOB set status='"+status+"' WHERE related_job_id='"+job_id+"'";
    result = run_query(query_string, data, callback);
}
*/
/*
var client = mysql.createConnection({
host: 'address',
port: 'port',
database: 'database',
user: 'root',
password: 'pass'
        });  

client.query('USE Company');
client.query('SELECT * FROM products', function(error, result, fields){
        if(error)
        {    
            //console.log('query error');
        }else
        {    
            //console.log(result);
        }    
    });  
*/

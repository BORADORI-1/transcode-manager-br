// vim:set ts=8 sw=4 sts=4 et ai ci nu:
/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */

const os = require('os');
const fs = require('fs');
const async = require('async');
const spawn = require('child_process').spawn;
const logger = require('./logger.js');

let sms_admin_group = [];

function npad(n, width)
{
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
}

function eval_oper(data, str)
{
    try
    {
        var res = Function('data', '"use strict"; return ('+str+')')(data);
        return res;
    }catch(e)
    {
        logger.error("eval_oper(): Failed to change value Check ('"+str+"') Plz "+JSON.stringify(e));
    }
}

function time_to_string(datetime)
{
    var retval = null;
    try {
        var tdate = new Date(datetime);
        var tyyyy = tdate.getFullYear();
        var tmon = npad(tdate.getMonth()+1, 2);
        var tday = npad(tdate.getDate(), 2);
        var thour = npad(tdate.getHours(), 2);
        var tmin = npad(tdate.getMinutes(), 2);
        var tsec = npad(tdate.getSeconds(), 2);
        retval = ''+tyyyy+''+tmon+''+tday+''+thour+''+tmin+''+tsec;
    }catch(err) {
        logger.error("time_to_string(): parse datetime error '"+datetime+"'");
    }
    return retval;
}

function is_valid_number(val)
{
//    if(null === val){ return false; }
    if('number' !== typeof(val)) {
        val = Number.parseInt(val);
//        val = Number(val);
    }
    if(Number.isFinite(val)) {
        return true;
    }
    return false;
}

function to_number(val)
{
    if('number' !== typeof(val)) {
        val = Number.parseInt(val);
    }
    if(!Number.isFinite(val)) {
        return 0;
    }
    return val;
}

function is_valid_data(val)
{
    if(false === !!val)
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
        if(fs.existsSync(tpath))
        {
            return;
        }
        fs.mkdirSync(tpath, 0755);
    }
}

function get_version_at_mediaurl(mediaurl)
{
    if(false === !!mediaurl) { return 0; }
    var pathlist = mediaurl.split('/');
    var filename = pathlist[pathlist.length-1];
    var filenamesplit = filename.split('_');
    var versionstring = '';
    var index;
    var re = /^\w\d\d\./;
    var vs;

    /* XXX_v2.smil */
    if(1 >= filenamesplit.length) { return 1; }
    versionstring = filenamesplit[filenamesplit.length-1];
    if(0 === versionstring.indexOf('v'))
    {
        var vs = versionstring.substring(1);
        vs = path.basename(vs, path.extname(vs))
        if(is_valid_number(vs)) { return Number(vs); }
    }
    /* XXX_v2_t31.mp4 */
    vs = null;
    if(2 >= filenamesplit.length) { return 1; }
    if(false === re.test(filenamesplit[filenamesplit.length-1])) { return 1; }
    versionstring = filenamesplit[filenamesplit.length-2];
    if(0 === versionstring.indexOf('v')) { vs = versionstring.substring(1); }
    /* HTTP 에서는 혹시 모르니 */
    else if(0 === versionstring.indexOf('V')) { vs = versionstring.substring(1); }
    if(vs)
    {
        if(is_valid_number(vs)) { return Number(vs); }
    }
    return 1;
}

function make_sms_group(group_list)
{
    var sms_receiver = JSON.parse(JSON.stringify(sms_admin_group));
    group_list.forEach(function(item, index, array)
            {
                sms_receiver = sms_receiver.concat(item.split(','));
            });
    sms_receiver = sms_receiver.reduce(function(a,b){ if(0 > a.indexOf(b)) { a.push(b); } return a;}, []);
    return sms_receiver;
}

function getdatetimestring(datestring)
{
    var datetimestring = datestring.substring(0,4) + '-' + datestring.substring(4,6) + '-' + datestring.substring(6,8) + ' ' + datestring.substring(8,10) + ':' + datestring.substring(10,12) + ':' + datestring.substring(12,14);
    return datetimestring;
}

function report_data(sms_group, report_url, request_url, send_data, report_type, report_api_error, spid, cpid, api_list, callback)
{
    var clipid = '';
    if(send_data && send_data.clipid)
    {
        clipid = send_data.clipid;
    }
    api.report_and_check(report_url, request_url, send_data, report_type, api_list,
            function(report_err, request_err)
            {
                if(report_err)
                {
                    logger.error("Report Error : "+toString(report_err)+" "+spid+":"+cpid+" "+clipid+" - SMS (ANALYTIC)");
                    if(!report_api_error[spid])
                    {
                        report_api_error[spid] = true;
                        smscall("[api] "+spid+" clipreport http ("+clipid+") error", {group: sms_group }, null);
                    }
                    return callback(report_err);
                }
                if(report_api_error[spid])
                {
                    report_api_error[spid] = false;
                    smscall("[api] "+spid+" clipacquirereport http OK", {group: sms_group }, null);
                }
                if(request_err)
                {
                    logger.error("Verify Error : "+toString(request_err));
                    return callback(null, request_err);
                }
                return callback(null, null);
            });
}


// Base Config Read
function read_config(config_file, acquire_index)
{
    let config;
    try
    {
        config = JSON.parse(fs.readFileSync(config_file,'utf8'));
    } catch(e) {
        console.log("[CRITICAL] configuration.json error .. check configuration.json syntax "+JSON.stringify(e));
        process.exit(1);
    }

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

    // process_type 이 없는 경우
    if(config.process_type === null || config.process_type === undefined || config.process_type === "") {
        // 없는 경우 종료시킨다
        console.log("[CRITICAL] process_type not found .. check configuration.json syntax");
        process.exit(1);
    }
    switch(config.process_type)
    {
    case 'master':
    case 'main':
        config.operation_mode = 'main';
        break;
    case 'slave':
    case 'backup':
    case 'sub':
        config.operation_mode = 'backup';
        break;
    default:
        console.log("[CRITICAL] process_type not found .. check configuration.json ");
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
/*
    // runmode 없는 경우
    if(config.runmode === null || config.runmode === undefined || config.runmode === "") {
        // 없는 경우 종료시킨다
        // 일반 모드임
        config.runmode = 'normal';
    }
*/
    if(config.default_alert_group === undefined || config.default_alert_group === null || config.default_alert_group === '' || config.default_alert_group.length <= 0) {
        // 없는 경우 종료시킨다
        console.log("[CRITICAL] default_alert_group not found .. check configuration.json syntax");
        process.exit(1);
    }
    for(var key in config.default_alert_group)
    {
        sms_admin_group.push(config.default_alert_group[key]);
    }
    let ipaddress = getipaddress();
    if(!!config.listen && !!config.listen.address){
        config.server_ip = config.listen.address;
    }else{
        config.server_ip = ipaddress[0];
    }

    let acquire_sequence = {};
    acquire_sequence.index = 0;

    if(config.acquire_sequence && Number.isSafeInteger(config.acquire_sequence.max)){
        acquire_sequence.max = config.acquire_sequence.max;
    }
    if(config.acquire_sequence && Number.isSafeInteger(config.acquire_sequence.min)){
        acquire_sequence.min = config.acquire_sequence.min;
    }

    if(Number.isSafeInteger(config.seq)){
        acquire_sequence.index = config.seq;
    }else if(Number.isSafeInteger(config.sequence)){
        acquire_sequence.index = config.sequence;
    }else if(Number.isSafeInteger(config.acquire_sequence)){
        acquire_sequence.index = config.acquire_sequence;
    }else if('object' == typeof(config.acquire_sequence) && Number.isSafeInteger(config.acquire_sequence.index)){
        acquire_sequence.index = config.acquire_sequence.index;
    }
    if(is_valid_number(acquire_index)){
        acquire_sequence.index = to_number(acquire_index);
    }
    config.acquire_sequence = acquire_sequence;

    return config;
}

function check_acquire_sequence(sequence)
{
    let l = fs.readdirSync('/proc');
    for (let pid of l)
    {
        if(!is_valid_number(pid)){ continue; }
        cmd_data = fs.readFileSync('/proc/'+pid+'/cmdline', {encoding: 'utf8'});
        if(0 != cmd_data.indexOf('node')){ continue; }
        if(5 != cmd_data.indexOf('data_manager.js')){ continue; }
        let pos = cmd_data.lastIndexOf(String(sequence));
        if(cmd_data[pos-1] == '\x00' && cmd_data[pos + String(sequence).length] == '\x00'){
            return true;
        }
    }
    return false;
}

function run_worker(child_process, config_path, acquire_sequence, check)
{
    let min = 1;
    let max = 0;
    if(!!acquire_sequence.min){ min = acquire_sequence.min; }
    if(!!acquire_sequence.max){ max = acquire_sequence.max; }
    if(!max){ return; }
    for(let i = min; i <= max; ++i)
    {
        let cmd_data;
        if(!!check && check_acquire_sequence(i)){ continue; }
        let proc = spawn('node', ['data_manager.js', config_path, i], { stdio: 'ignore', detached: true });
        child_process.push(proc);
    }
}

// Util Functions
function getipaddress()
{
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

function geterrormsg(statuscode)
{
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

function smscall(msg, meta, callback)
{
    logger.debug('[SMSCall] SMSCALL MSG="' + msg + '" TARGET=' + meta.group.join(','));
    // Message Filtering
    var no_sms = false;
    var sms_msg = msg;
    var now = new Date();
    var config;

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
        global.clipacquirelist_api_error = true;
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
            function(cb_waterfall)
            {
                let dbdata = global.dbdata;
                return dbdata.get_data_manager_config(function(err, res)
                    {
                        return cb_waterfall(err, res, null);
                    });
            },
            function(result, resolve, cb_waterfall)
            {
                if(true === !!result && true === !!result[0].sms_alarm && "Y" === result[0].sms_alarm)
                {
                    return cb_waterfall(null, true);
                }
                return cb_waterfall(null, false);
            },
            function(sms_flag, cb_waterfall)
            {
                if(sms_flag !== true || no_sms) { return cb_waterfall(new Error('SMS off')); }
                api.slack(sms_msg, null);
                return api.sms(sms_msg, meta.group, cb_waterfall);
            }
            ], function(waterfall_err)
            {
                if(waterfall_err)
                {
                    logger.debug('[SMSCall] ' + waterfall_err);
                }else
                {
                    logger.debug('[SMSCall] Send Success');
                }
                if(true === !!callback)
                {
                    callback(waterfall_err);
                }
            });
}

function toString(s)
{
    if(s === undefined || s === null) { return ""; }
    return s.toString();
}

function mytrim(x)
{
//    return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
    if(x === null || x === undefined) { return ""; } 
    return x.toString().replace(/^\s+|\s+$/gm,'');
}

function dbj2_hash(p)
{
    let chars = p;
    if(typeof(chars) != 'string'){
        chars = JSON.stringify(chars);
    }
    chars = chars.split('').map(function(str){
        return str.charCodeAt(0);
    });
    if (!Array.isArray(chars)){
        return null;
    }

    let hash = 5381n;
    let nhash = 0n;
    let filter = 0xffffffffn;
    for(let i = 0; i < chars.length; i++){
        nhash = (hash << 5n);
        nhash = (nhash + hash);
        nhash = nhash + BigInt(chars[i]);
        hash = (nhash & filter);
    }
    return hash.toString(16);
}

function now_format(format)
{
    let result = format;
    let n = new Date(); let v;
    result = result.replace('YYYY', n.getFullYear());
    v = n.getMonth() + 1;
    if(v < 10){ v = '0'+v; }
    result = result.replace('MM', v);
    v = n.getDate();
    if(v < 10){ v = '0'+v; }
    result = result.replace('DD', v);
    v = n.getHours();
    if(v < 10){ v = '0'+v; }
    result = result.replace('HH', v);
    v = n.getMinutes();
    if(v < 10){ v = '0'+v; }
    result = result.replace('mm', v);
    v = n.getSeconds();
    if(v < 10){ v = '0'+v; }
    result = result.replace('ss', v);
    v = n.getMilliseconds();
    if(v < 10){ v = '0'+v; }
    if(v < 100){ v = '0'+v; }
    result = result.replace('SSS', v);
    return result;
}

function check_event_info(config, event_info, callback)
{
    if(global.config.operation_mode == 'main'){
        callback(null);
        return;
    }
    global.dbdata.read_event(event_info.process, event_info.sequence, event_info.event, function(error, result)
        {
            if(error){
                logger.error('check_event_info(): Failed read DB '+error);
                callback(error);
                return;
            }
            if(0 == result.length){
                logger.info('check_event_info(): not found db data');
                callback(null);
                return;
            }
            let now_time = Date.now();
            let check_time = false;
            let res = result.some(function(entry, index, array)
                {
                    if(!entry.work_date) { return false; }
                    if(!entry.address == config.server_ip) { return false; }
                    let work_time = new Date(entry.work_date).getTime();
                    check_time = true;
                    if(now_time - work_time < (config.heartbeat_timeout * 1000)){
                        logger.error('check_event_info(): now - work_date ('+entry.work_date+') = '+(now_time - work_time)+' < '+(global.config.heartbeat_timeout * 1000));
                        return true;
                    }
                    return false;
                }.bind(this));
                if(res == true && !! check_time){
                    callback(new Error('skip'));
                    return;
                }
                logger.info('check_event_info(): wakeup backup');
                callback(null);
        }.bind(this));
}

function data_convert_entry(output_data, convert_info, input_data, callback)
{
    output_data[convert_info.name] = eval_oper(input_data, convert_info.value);

    switch(convert_info.datatype)
    {
    case 'number':
        output_data[convert_info.name] = Number(output_data[convert_info.name]);
        if(isNaN(output_data[convert_info.name])) { output_data[convert_info.name] = 0; }
        break;
    case 'path':
        output_data[convert_info.name] = path.normalize(output_data[convert_info.name]);
        break;
    case 'string':
        output_data[convert_info.name] = String(output_data[convert_info.name]);
        break;
    default:
        break;
    }
    callback(null);
    return;
}

function update_event_info(wakeup_date, work_date, callback)
{
    let update_info = Object.assign({}, this.event_info);
    update_info.wakeup_date = wakeup_date;
    update_info.work_date = work_date;
    global.dbdata.update_event(update_info,
        function(err, res)
        {
            if(err){
                logger.error('update_event_info('+this.event_info.event+'): failed to update event info '+err.toString());
            }
            callback(err);
            return;
        }.bind(this));
    return;
}


exports.npad = npad;
exports.eval_oper = eval_oper;
exports.time_to_string = time_to_string;
exports.is_valid_number = is_valid_number;
exports.to_number = to_number;
exports.is_valid_data = is_valid_data;
exports.mkdir_for_file = mkdir_for_file;
exports.get_version_at_mediaurl = get_version_at_mediaurl;
exports.make_sms_group = make_sms_group;
exports.getdatetimestring = getdatetimestring;
exports.report_data = report_data;
exports.read_config = read_config;
exports.check_acquire_sequence = check_acquire_sequence;
exports.run_worker = run_worker;
exports.getipaddress = getipaddress;
exports.geterrormsg = geterrormsg;
exports.replaceAll_old = replaceAll_old;
exports.replaceAll = replaceAll;
exports.mysqlsinglequote = mysqlsinglequote;
exports.smscall = smscall;
exports.toString = toString;
exports.mytrim = mytrim;
exports.dbj2_hash = dbj2_hash;
exports.now_format = now_format;
exports.check_event_info = check_event_info;
exports.data_convert_entry = data_convert_entry;
exports.update_event_info = update_event_info;

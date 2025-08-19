// vim:set ts=8 sw=4 sts=4 et ai ci nu:
//var request = require('request');
const axios = require('axios');
const async = require('async');
const https = require('https');
const querystring = require('querystring');
const logger = require('./logger.js');
const util = require('./util.js');

/********************************************************************************
 *                                                                              *
 * callback은 항상 function(error, statuscode, config) 형식으로 사용            *
            //console.log('상태:', response.statusCode);
 *                                                                              *
 ********************************************************************************/
function Api(request_timeout, report_timeout, retry, interval, sms)
{
    this.request_timeout = 300000;
    this.request_retry = 3;
    this.request_interval = 2000;
    this.report_timeout  = 120000;
    this.sms_data = 
    {
        url: "http://211.233.68.197:8080/send_msg/send_sms.php",
        id: "solbox",
        pw: "solutionbox00",
        cb: "0221823695",
        prefix_message: "[LGU+]"
    }
    this.slack_api = "https://hooks.slack.com/services/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";
    if(true === !!request_timeout) { this.request_timeout = request_timeout; }
    if(true === !!report_timeout) { this.report_timeout = report_timeout; }
    if(true === !!retry) { this.request_retry = retry; }
    if(true === !!interval) { this.request_interval = interval; }
    if(true === !!sms)
    {
        if(true === !!sms.url) { this.sms_data.url = sms.url; }
        if(true === !!sms.id) { this.sms_data.id = sms.id; }
        if(true === !!sms.pw) { this.sms_data.pw = sms.pw; }
        if(true === !!sms.cb) { this.sms_data.cb = sms.cb; }
        if(true === !!sms.prefix) { this.sms_data.prefix_message = sms.prefix; }
    }
}

function change_config(request_timeout, report_timeout, request_retry, request_interval, sms)
{
    if(true === !!request_timeout) { this.request_timeout = request_timeout; }
    if(true === !!report_timeout) { this.report_timeout = report_timeout; }
    if(true === !!request_retry) { this.request_retry = request_retry; }
    if(true === !!request_interval) { this.request_interval = request_interval; }
    if(true === !!sms) { this.set_sms_config(sms); }
}

function set_sms_config(sms)
{
    if(false === !!sms) { return false; }
    if(true === !!sms.url) { this.sms_data.url = sms.url; }
    if(true === !!sms.id) { this.sms_data.id = sms.id; }
    if(true === !!sms.pw) { this.sms_data.pw = sms.pw; }
    if(true === !!sms.cb) { this.sms_data.cb = sms.cb; }
    if(true === !!sms.prefix) { this.sms_data.prefix_message = sms.prefix; }
    return true;
}

function report_and_check(report_url, request_url, report_data, report_type, api_list, callback)
{
    async.waterfall([
                    function(cb_rac_wf) { return setTimeout(cb_rac_wf, 0, null, report_url, request_url, report_data, report_type, api_list); },
                    rac_make_report_data,
                    rac_send_report.bind(this),
                    rac_check_report_result,
                    rac_make_request_data,
                    rac_send_request.bind(this),
                    rac_check_request_result
            ], function(err, result){ rac_done(err, result, callback); });
    return;

    function data_convert_entry(send_data, convert_info, input_data, cb_conv_each)
    {
        send_data[convert_info.name] = eval_oper(input_data, convert_info.value);
        if(convert_info.datatype == 'number')
        {
            if(isNaN(send_data[convert_info.name]))
            {
                send_data[convert_info.name] = 0;
            }
        }
        switch(convert_info.datatype)
        {
        case 'number':
            if(isNaN(send_data[convert_info.name])) { send_data[convert_info.name] = 0; }
            break;
        case 'path':
            send_data[convert_info.name] = path.normalize(send_data[convert_info.name]);
            break;
        default:
            break;
        }
        setTimeout(cb_conv_each, 0, null);
        return;
        function eval_oper(data, str)
        {
            return Function('data', '"use strict"; return ('+str+')')(data);
        }
    }
    function rac_make_report_data(report_url, request_url, report_data, report_type, api_list, cb_rac_wf)
    {
        if(!api_list || api_list.length <= 0)
        {
            setTimeout(cb_rac_wf, 0, null, report_url, request_url, report_data, report_type, api_list, report_data);
            return;
        }
        var send_data = {};

        async.each(api_list,
                function(entry, cb)
                {
                    if(entry.type != 'response')
                    {
                        setTimeout(cb, 0, null);
                        return;
                    }
                    setTimeout(data_convert_entry, 0, send_data, entry, report_data, cb);
                    return;
                },
                function(err)
                {
                    if(err)
                    {
                        setTimeout(cb_rac_wf, 0, err, 0);
                        return;
                    }
                    setTimeout(cb_rac_wf, 0, null, report_url, request_url, report_data, report_type, api_list, send_data);
                });
        //setTimeout(cb_clip_wf, 0, null, cp_info, clip_info);
    }
    function rac_send_report(report_url, request_url, report_data, report_type, api_list, send_data, cb_rac_wf)
    {
        this.report(report_url, send_data, report_type,
                function(err, response, body){
                    if(err) { return cb_rac_wf(err, 0); }
                    setTimeout(cb_rac_wf, 0, null, request_url, report_data, api_list, send_data, response, body);
                }.bind(this));
    }
    function rac_check_report_result(request_url, report_data, api_list, send_data, response, report_result, cb_rac_wf)
    {
        if(response.statusCode !== 200) { return cb_rac_wf(new Error('HTTP StatusCode: ' + response.statusCode), 0); }
        logger.debug("Job Report Success: "+ report_result);
        setTimeout(cb_rac_wf, 0, null, request_url, report_data, api_list, send_data);
    }
    function rac_make_request_data(request_url, report_data, api_list, report_send_data, cb_rac_wf)
    {
        var request_data = {};
        if(!api_list || api_list.length <= 0)
        {
            request_data.cpid = report_data.cpid;
            request_data.type = 'recent';
            request_data.acquire = '';
            if(report_data.clipid) { request_data.clipid = report_data.clipid; }

            setTimeout(cb_rac_wf, 0, null, request_url, report_data, report_send_data, request_data);
            return;
        }
        
        async.each(api_list,
                function(entry, cb)
                {
                    if(entry.type != 'request')
                    {
                        setTimeout(cb, 0, null);
                        return;
                    }
                    setTimeout(data_convert_entry, 0, request_data, entry, report_data, cb);
                    return;
                },
                function(err)
                {
                    if(err)
                    {
                        setTimeout(cb_rac_wf, 0, err, 1);
                        return;
                    }
                    setTimeout(cb_rac_wf, 0, err, request_url, report_data, report_send_data, request_data);
                });

    }
    function rac_send_request(request_url, report_data, report_send_data, request_data, cb_rac_wf)
    {
        if(!request_url){
            cb_rac_wf(null, report_data, report_send_data, 'skip', null);
            return;
        }
        this.request(request_url, request_data, null, null, function(err, result)
                {
                    if(err)
                    {
                        setTimeout(cb_rac_wf, 0, err, 1);
                        return;
                    }
                    setTimeout(cb_rac_wf, 0, null, report_data, report_send_data, request_data, result);
                });
    }
    function rac_check_request_result(report_data, report_send_data, request_data, request_result, cb_rac_wf)
    {
        if(request_data == 'skip' && request_result == null){
            return setTimeout(cb_rac_wf, 0, null, null);
        }
        var response;
        if(typeof(request_result.body) == 'string'){
            logger.debug("Job ReCheck Success: "+request_result.body);
            try
            {
                var tab_removebody = request_result.body.replace(/\t/g, ' ');
                var quot_fixbody = util.replaceAll('＂data＂', '"data"', tab_removebody);
                response = JSON.parse(quot_fixbody);
            }catch(e) { return setTimeout(cb_rac_wf, 0, e, 1); }
        }else if(typeof(request_result.body) == 'object'){
            logger.debug("Job ReCheck Success: "+JSON.stringify(request_result.body));
            response = request_result.body;
        }else{
            setTimeout(cb_rac_wf, 0, new Error('unknown response'), 1);
        }

        var data = response.data;
        var check_result = null;
        if(!!data && Array.isArray(data) && data.length > 0)
        {
            for(var i = 0; i < data.length; ++i)
            {
                var cinfo = data[i];
                var match = null;
                var check = null;
                /* acquire 항목 값은 최 우선 비교 대상 */ 
                var acquire = null;
                for (var key in report_send_data)
                {
                    var id_idx = key.indexOf('id');
                    if(id_idx > 0 && id_idx + 2 == key.length && key != 'itemtypeid')
                    {
                        if(cinfo[key] != report_send_data[key])
                        {
                            match = false;
                        }else if(match == null)
                        {
                            match = true;
                        }
                    }else
                    {
                        if(key == "acquire")
                        {
                            acquire = false;
                            if(cinfo[key] == report_send_data[key])
                            {
                                acquire = true;
                            }
                        }
                        if(!!cinfo[key])
                        {
                            if(cinfo[key] != report_send_data[key])
                            {
                                check = false;
                            }else if(check == null)
                            {
                                check = true;
                            }
                        }
                    }
                }
                if(match == true)
                {
                    check_result = false;
                    if(check == true) { check_result = true; }
                    if(acquire == true) { check_result = true; }
                    if(acquire == false) { check_result = false; }
                    break;
                }
            }
        }
        switch(check_result)
        {
        case null:
            return setTimeout(cb_rac_wf, 0, new Error("Not Found"), 1);
        case false:
            return setTimeout(cb_rac_wf, 0, new Error("Not Applied"), 1);
        case true:
            return setTimeout(cb_rac_wf, 0, null, null);
        }
    }

    function rac_done(err, result, cb)
    {
        if(err)
        {
            if(result == 0)
            {
                logger.error("report_and_check: report fault "+JSON.stringify(err));
                setTimeout(cb, 0, err, null);
                return;
            }
            logger.error("report_and_check: check fault "+JSON.stringify(err));
            setTimeout(cb, 0, null, err);
            return;
        }
        setTimeout(cb, 0, null, null);
    }
}

function report_result(report_url, query_string, report_type, callback)
{
    var timeout = this.report_timeout;
    if(false === !!query_string) { return callback(new Error('query_string undefined')); }
    if(false === !!report_url) { return callback(new Error('report_url undefined')); }
    if(false === !!report_type) { report_type = 'both'; }

    logger.debug("[REPORT_RESULT] url='" + report_url + "' qs='" + JSON.stringify(query_string) + "' timeout=" + timeout);
    let report_option = {};
    report_option.method = 'post';
    report_option.url = report_url;
    report_option.params = {};
//    report_option.data = {};
    report_option.headers = {};
    report_option.responseEncoding = 'utf8';
    report_option.httpsAgent = new https.Agent({ rejectUnauthorized: false });
/*
    var body_string = querystring.stringify(query_string);
    var report_option = 
    {
        url: report_url,
        timeout: timeout
    }
    switch(report_type)
    {
    case 'both':
        report_option.headers = {"Content-Type":"text/plain"};
        report_option.qs = query_string;
        report_option.body = body_string;
        break;
    case 'get':
        report_option.qs = query_string;
        break;
    case 'post':
        report_option.form = query_string;
        break;
    case 'json':
        report_option.json = query_string;
        break;
    default:
        return callback(new Error('unknown report_type'));
    }
    request.post(report_option, callback);
*/
    switch(report_type)
    {
    case 'both':
        report_option.headers = {"Content-Type":"text/plain"};
        report_option.params = query_string;
        report_option.data = querystring.stringify(query_string);
        break;
    case 'get':
        report_option.params = query_string;
        break;
    case 'post':
//*
        const params = new URLSearchParams();
        for (const name in query_string)
        {
            params.append(name, query_string[name]);
        }
        report_option.headers = {'Content-Type': 'application/x-www-form-urlencoded'};
        report_option.data = query_string;
        //report_option.params = query_string;
/*/

//        let bodyFormData = new FormData();
//        for (const name in query_string)
//        {
//            bodyFormData.append(name, query_string[name]);
//        }
//        report_option.data = bodyFormData;
        report_option.headers = {'Content-Type': 'application/x-www-form-urlencoded'};
        report_option.data = querystring.stringify(query_string);
//*/
        break;
    case 'json':
        report_option.responseType = 'json';
        report_option.data = JSON.stringify(query_string);
        //report_option.resopnseType = 'json';
        report_option.headers = {"Content-Type":"application/json"};
    }
    axios(report_option).then(response_http).catch(error_http);
    return;
    function response_http(response)
    {
        let res = {};
        res.statusCode = response.status;
        res.statusMessage = response.statusText;
        res.headers = response.headers;
        callback(null, res, res.data);
    }
    function error_http(error)
    {
        callback(error, null, null);
    }
}

function request_acquirelist(request_url, query_string, timeout, retrycount, callback)
{
    if(false === !!query_string) { return callback(new Error('query_string undefined')); }
    if(false === !!request_url) { return callback(new Error('request_url undefined')); }
    if(false === !!timeout) { timeout = this.request_timeout; }
    if(false === !!retrycount) { retrycount = this.request_retry; }

    logger.debug("[REQEST_ACQUIRELIST] url='" + request_url + "' data='" + JSON.stringify(query_string) + "' timeout=" + timeout);

    function request_doing(cb_doing)
    {
        let request_option = {};
        request_option.method = 'get';
        request_option.url = request_url;
        //request_option.params = {};
        request_option.params = query_string; 
//        request_option.data = {};  // wrong init (right value is undefined maybe)
        request_option.headers = {};
        request_option.httpsAgent = new https.Agent({ rejectUnauthorized: false });
/*
        request_option.responseType = 'json';
        request_option.responseEncoding = 'utf8';
*/
/*
        var request_opt = 
        {
            url: request_url,
            qs: query_string,
            timeout: timeout
        };
        request.get(request_opt, cb_http);
*/
        axios(request_option).then(response_http).catch(error_http);
        return;
        function response_http(response)
        {
            if(response.status != 200) {
                let err = new Error(response.status);
                cb_doing(err, null, null);
                return ;
            }
            let res = {};
            res.statuscode = response.status;
            res.response = {};
            res.response.statusCode = response.status;
            res.response.statusMessage = response.statusText;
            res.body = response.data;
            cb_doing(null, res);
        }
        function error_http(error)
        {
            cb_doing(error, null, null);
        }
/*
        function cb_http(err, res, body)
        {
            if(err || res.statusCode !== 200)
            {
                if(!err) { err = new Error(res.statusCode);}
                return setTimeout(cb_doing, 0, err);
            }
            var result = 
            {
                statuscode: res.statusCode,
                response: res,
                body: body
            };
            cb_doing(null, result);
        }
*/
    }
    function request_done(err, result)
    {
        if(err) { return setTimeout(callback, 0, err); }
        return setTimeout(callback, 0, null, result);
    }
    async.retry({times : retrycount, interval : this.request_interval}, request_doing, request_done);
}

function request_content_info(download_url, download_rule, callback)
{
    var timeout = this.request_timeout;
    if(false === !!download_url) { return callback(new Error('download_url undefined')); }

    logger.debug("Check HTTP HEAD...URL="+download_url);
    async.retry({times:this.request_retry, interval: this.request_interval}, request_doing, request_done);

    function request_doing(cb_doing)
    {
        let request_option = {};
        request_option.method = 'head';
        request_option.url = download_url;
        request_option.httpsAgent = new https.Agent({ rejectUnauthorized: false });
/*
        var request_opt =
        {
            url: download_url,
            timeout: timeout
        };
*/
        if(download_rule && download_rule.headers) {
            try
            {
                var r = JSON.parse(download_rule.headers);
                request_option.headers = r;
            }catch (e)
            {
                logger.error("Parse Error Download Rule "+e.toString());
            }
        }
/*
        request.head(request_opt, cb_http);
*/
        axios(request_option).then(response_http).catch(error_http);
        return;

        function response_http(response)
        {
            let res = {};
            if(response.status !== 200){
                let err = new Error(response.status);
                cb_doing(err);
                return;
            }
            res.statusCode = response.status;
            res.statusMessage = response.statusText;
            res.headers = response.headers;
            cb_doing(null, res);
        }
        function error_http(error)
        {
            cb_doing(error);
        }
/*
        function cb_http(err, res, body)
        {
            if(err || res.statusCode !== 200)
            {
                if(!err) { err = new Error(res.statusCode); }
                return setTimeout(cb_doing, 0, err);
            }
            cb_doing(null, res);
        }
*/
    }
    function request_done(err, result)
    {
        if(err) { return setTimeout(callback, 0, err); }
        return setTimeout(callback, 0, null, result);
    }
}

function send_sms_message(message, group, callback)
{
    if(false === !!this.sms_data || !group || group.length == 0)
    {
        console.log("[SMS CALL FAULT] "+message+" "+JSON.stringify(group));
        return callback(new Error("Config Error"));;
    }
    var get_form = 
    {
        url: this.sms_data.url,
        params:
        {
            id: this.sms_data.id,
            pw: this.sms_data.pw,
            pn: group.join(','),
            cb: this.sms_data.cb,
            msg: this.sms_data.prefix_message + message
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 30000
    };
    if(config && config.runmode !== 'normal')
    {
        get_form.params.msg = '[DEV]' + get_form.params.msg;
    }
/*
    request.get(get_form, function(err, response, body)
            {
                if(err) { return callback(err); }
                if(response.statusCode !== 200)
                {
                    return callback(new Error('response : ' + response.statusCode));
                }
                return callback(null);
            });
*/
    axios(get_form).then(response_http).catch(error_http);
    return;
    function response_http(response)
    {
        if(response.status !== 200){
            let err = new Error('response : ' + response.status);
            callback(err);
            return;
        }
        callback(null);
    }
    function error_http(error)
    {
        callback(error);
    }
}

function send_slack_message(message, callback)
{
    if(!this.slack_api){
        if(callback){ callback(null); }
        return;
    }
    let prefix_message = '';
    if(this.sms_data && this.sms_data.prefix_message){ prefix_message = this.sms_data.prefix_message; }
    let get_form = 
    {
        url: this.slack_api,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        data: { text: prefix_message + message },
        timeout: 30000
    };
    if(config && config.runmode !== 'normal')
    {
        get_form.data.text = '[DEV]' + get_form.data.text;
    }
    axios(get_form).then(response_http).catch(error_http);
    return;
    function response_http(response)
    {
        if(!callback){ return; }
        if(response.status !== 200){
            let err = new Error('response : ' + response.status);
            callback(err);
            return;
        }
        callback(null);
    }
    function error_http(error)
    {
        if(!callback){ return; }
        callback(error);
    }
}

function media_check(media_check_url, request_form, callback)
{
    let request_option = {};
    request_option.method = 'get';
    request_option.url = media_check_url;
    request_option.params = request_form; 
    request_option.timeout = 120000;
    request_option.httpsAgent = new https.Agent({ rejectUnauthorized: false });

    axios(request_option).then(response_http).catch(error_http);
    return;
    function response_http(response)
    {
        if(response.status != 200){
            logger.error("Failed to Check MediaUrl HTTP Status not 200 - SMS (ANALYTIC)");
            return callback(new Error('HTTP StatusCode: ' + response.statusCode));
        }
        logger.debug("MediaUrl Check Success : " + body);
        let res;
        try{
            if(typeof(response.data) == 'string'){
                let tab_removebody = response.data.replace(/\t/g, ' ');
                res = JSON.parse(tab_removebody);
            }else {
                res = response.data;
            }
        }catch(err){
            logger.error("Failed to Check MediaUrl Parse result");
            return callback(new Error("Parse JSON"));
        }
        if(res.usable == 'yes'){
            return callback(null, true);
        }
        return callback(null, false);
    }
    function error_http(error)
    {
        logger.error("Failed to Check MediaUrl HTTP Error - SMS (ANALYTIC)");
        return callback(err);
    }

/*
    request.get({
                url: media_check_url,
                qs: request_form,
                timeout: 120000
            },
            function(err, response, body)
            {
                if(err)
                {
                    logger.error("Failed to Check MediaUrl HTTP Error - SMS (ANALYTIC)");
                    return callback(err);
                }
                if(response.statusCode !== 200)
                {
                    logger.error("Failed to Check MediaUrl HTTP Status not 200 - SMS (ANALYTIC)");
                    return callback(new Error('HTTP StatusCode: ' + response.statusCode));
                }
                logger.debug("MediaUrl Check Success : " + body);
                var response;
                try
                {
                    var tab_removebody = body.replace(/\t/g, ' ');
                    response = JSON.parse(tab_removebody);
                }catch(err)
                {
                    logger.error("Failed to Check MediaUrl Parse result");
                    return callback(new Error("Parse JSON"));
                }
                if(result.usable === 'yes')
                {
                    return callback(null, true);
                }
                return callback(null, false);
            });
*/
}

Api.prototype.report = report_result;
Api.prototype.request = request_acquirelist;
Api.prototype.get_info = request_content_info;
Api.prototype.report_and_check = report_and_check;
Api.prototype.sms = send_sms_message;
Api.prototype.slack = send_slack_message;
Api.prototype.set_sms = set_sms_config;
Api.prototype.set_config = change_config;
Api.prototype.check_mediaurl = media_check;
module.exports = Api;



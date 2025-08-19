// vim:set ts=8 sw=4 sts=4 et ai ci nu:
// Logger
// Logger 생성
const winston = require('winston');
const winston_daily = require('winston-daily-rotate-file');
const http = require('http');
const https = require('https');
const url = require('url');
const util = require('./util.js');
var logger;
var last_send_sms_time = [ 0, 0 ];
var last_sms_message = '';
var drop_sms_count = 0;
//var enable_sms_alarm = 1;
var enable_sms_alarm = 0;
let acquire_index = '';

var sms_url = "http://error.solbox.co.kr/send_sms.php";
var mail_url = "";
var alert_receiver = "unknown";
var alert_prefix = "[acquire]";
var sms_callback = "00000000000";
var mail_callback = "alert@solbox.com";

exports.init_logger = function(config)
{
    var config_dummy =
    {
        "log_path" : '/usr/service/logs/data_manager',
        "log_level" : 'error',
    };

    if(config == undefined) config = config_dummy;
    if(config.log_path == undefined)
    {
        console.log('init_logger(): Failed to get log_path, use /usr/service/logs/data_manager');
        config.log_path = '/usr/service/logs/data_manager';
    }
    if(config.log_level == undefined)
    {
        console.log('init_logger(): Failed to get log_level, use error');
        config.log_level = 'error';
    }
    if(config.acquire_sequence && util.is_valid_number(config.acquire_sequence.index)){
        acquire_index = config.acquire_sequence.index;
    }
    if(config.alert_info)
    {
        if(config.alert_info.sms_url)
        {
            sms_url = config.alert_info.sms_url;
        }
        if(config.alert_info.mail_url)
        {
            mail_url = config.alert_info.mail_url;
        }
        if(config.alert_info.receiver)
        {
            alert_receiver = config.alert_info.receiver;
        }
        if(config.alert_info.message_prefix)
        {
            alert_prefix = config.alert_info.message_prefix;
        }
        if(config.alert_info.sms_callback)
        {
            sms_callback = config.alert_info.sms_callback;
        }
        if(config.alert_info.mail_callback)
        {
            mail_callback = config.alert_info.mail_callback;
        }
    }
    var fixed_syslog_config = 
    {
        levels:
        {
            debug: 0, 
            info: 1,
            notice: 2,
            warning: 3,
            error: 4, 
            crit: 5,
            alert: 6,
            emerg: 7
        },
        colors:
        {
            debug: 'blue',
            info: 'green',
            notice: 'yellow',
            warning: 'red',
            error: 'red', 
            crit: 'red',
            alert: 'yellow',
            emerg: 'red'
        }
    };
    
    var error_log = {
        name: 'error',
        level: 'error',
        json: false,
        dirname: config.log_path,
        filename: 'data_manager_'+acquire_index+'_%DATE%',
        datePattern: 'yyyyMMDD',
        extension: '.err'
    };
    var default_log = {
        name: 'log',
        level: config.log_level,
        json: false,
        dirname: config.log_path,
        filename: 'data_manager_'+acquire_index+'_%DATE%',
        datePattern: 'yyyyMMDD',
        extension: '.log'
    };
    var format = winston.format;

    var my_format = winston.format.printf(({level, message, timestamp }) => {
        timestamp = util.now_format('HH:mm:ss.SSS');
        return `${timestamp} [${level.toUpperCase()}] ${message}`;
    });

    logger = new winston.createLogger({
        //format: winston.format.simple(),
        levels: winston.config.syslog.levels,
        format: winston.format.combine( winston.format.timestamp(), my_format ),
        transports: [
            new winston_daily(error_log),
            new winston_daily(default_log)
        ]
    });
//*/
}

exports.disable_sms_alarm = function()
{
    enable_sms_alarm = 0;
}

exports.enable_sms_alarm = function()
{
    enable_sms_alarm = 1;
}

exports.get_logger = function()
{
    return logger;
}

exports.log = function(level, message)
{
    if(logger == undefined) console.log("["+level+"] "+message);
    else logger.log(level, message);
}

exports.emerg = function(message)
{
    if(logger == undefined) console.log("[emerg] "+message);
    else logger.log('emerg', message);
}

exports.alert = function(message)
{
    if(logger == undefined) console.log("[alert] "+message);
    else logger.log('alert', message);
}

exports.crit = function(message)
{
    if(logger == undefined) console.log("[crit] "+message);
    else logger.log('crit', message);
}

exports.error = function(message)
{
    if(logger == undefined) console.log("[error] "+message);
    else logger.log('error', message);
}

exports.warning = function(message)
{
    if(logger == undefined) console.log("[warning] "+message);
    else logger.log('warning', message);
}

exports.notice = function(message)
{
    if(logger == undefined) console.log("[notice] "+message);
    else logger.log('notice', message);
}

exports.info = function(message)
{
    if(logger == undefined) console.log("[info] "+message);
    else logger.log('info', message);
}

exports.debug = function(message)
{
    if(logger == undefined) console.log("[debug] "+message);
    else logger.log('debug', message);
}

exports.sms = function(message, dest)
{
    if(dest == undefined) dest='';
    message=alert_prefix+' '+message;
/*
var time = process.hrtime();
// [ 1800216, 25 ]

setTimeout(function() {
  var diff = process.hrtime(time);
  // [ 1, 552 ]

  console.log('benchmark took %d nanoseconds', diff[0] * 1e9 + diff[1]);
  // benchmark took 1000000527 nanoseconds
}, 1000);
*/
    function check_timer()
    {
        var diff = process.hrtime(last_send_sms_time);
        if(diff[0] < 300)
        {
            setTimeout(check_timer, 60);
            return;
        }
        last_send_sms_time = process.hrtime();
        if(0 < drop_sms_count)
        {
            if(1 < drop_sms_count)
            {
                var count = drop_sms_count - 1;
                send_sms(alert_prefix+' WORKER_MANAGER SMS message dropped '+count+' times');
            }
            send_sms(last_sms_message);
        }
        drop_sms_count = 0;
        last_sms_message = '';
        return 0;
    }
    function send_sms(sms_msg)
    {
        if(enable_sms_alarm == 0) return;

        var parameter = 
        {
            id: 'solbox',
            pw: 'solutionbox00',
            pn: (dest==undefined || dest=='')?alert_receiver:dest,
            cb: sms_callback,
            msg: sms_msg 
        };
    //    var url_parameter = require('querystring').stringify(parameter);
/*
        var options = 
        {    
            host: 'sms-api.myskcdn.co.kr',
            port: '80',
            path: '/send_sms.php?' + require('querystring').stringify(parameter),
            method: 'GET',
            headers:
            {
                'Connection' : 'close'
            }
        }    
*/
        var options = 
        {    
            method: 'GET',
            headers:
            {
                'Connection' : 'close'
            }
        }
        var sms_info = url.parse(sms_url);
        options.hostname = sms_info.hostname;
        options.host = sms_info.hostname;
        options.port = sms_info.port;
        options.path = sms_info.pathname + '?' + require('querystring').stringify(parameter);
        if('' != sms_info.query)
        {
            options.path += '&'+sms_info.query;
        }

        function check_response(response)
        {
            return;
        }
        function result_error(error)
        {
            if(logger == undefined) console.log('[error] Failed to send sms message ('+error+') '+sms_msg);
            else logger.log('error', 'Failed to send sms message ('+error+') '+sms_msg);
            return;
        }
        var request;
        if(sms_info.protocol == 'http:')
        {
            request = http.request(options, check_response);
        }else
        {
            request = https.request(options, check_response);
        }
        request.on('error', result_error);
        request.end();
    }
    function send_mail(mail_title, mail_msg)
    {
        var parameter = 
        {
            id: 'solbox',
            pw: 'solutionbox00',
            to: alert_receiver,
            cc: '',
            from: mail_callback,
            subject: mail_title,
            message: mail_msg
        };
        var options = 
        {
            method: 'GET',
            headers:
            {
                'Connection' : 'close'
            }
        }
        var mail_info = url.parse(mail_url);
        options.hostname = mail_info.hostname;
        options.host = mail_info.hostname;
        options.port = mail_info.port;
        options.path = mail_info.pathname + '?' + require('querystring').stringify(parameter);
        if('' != mail_info.query)
        {
            options.path += '&'+mail_info.query;
        }

        function check_response(response)
        {
            return;
        }
        function result_error(error)
        {
            if(logger == undefined) console.log('[error] Failed to send e-mail ('+error+') '+mail_msg);
            else logger.log('error', 'Failed to send e-mail ('+error+') '+mail_title+'/'+mail_msg);
            return;
        }
        var request;
        if(mail_info.protocol == 'http:')
        {
            request = http.request(options, check_response);
        }else
        {
            request = https.request(options, check_response);
        }
        request.on('error', result_error);
        request.end();
    }
    function check_time()
    {
        var diff = process.hrtime(last_send_sms_time);
        if(diff[0] < 300)
        {
            if(drop_sms_count == 0) setTimeout(check_timer, 60);
            drop_sms_count ++;
            last_sms_message = message;
            return 1;
        }
        last_send_sms_time = process.hrtime();
        if(1 < drop_sms_count)
        {
            var count = drop_sms_count - 1;
            send_sms(alert_prefix+' WORKER_MANAGER SMS message dropped '+count+' times');
        }
        drop_sms_count = 0;
        last_sms_message = '';
        return 0;
    }

    if(0 == check_time())
    {
        send_sms(message);
    }
    
    if(logger == undefined) console.log("[alert] "+message);
    else logger.log('alert', 'alert-sms '+message);

    send_mail(alert_prefix+' WORKER_MANAGER WARNING', message);
}

//logger.error('init_function: Start Worer Manager');
//logger.debug('init_function: CONFIG_FILE_DATA='+JSON.stringify(config));
// 실제 사용예 logger.레벨(로그내용)
// 레벨 : debug, info, notice, warning, error, crit, alert, emerg

